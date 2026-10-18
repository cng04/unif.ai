"""Admin JSON: pipeline counts, unplaced members, group labels and weakest ties, all derived from stored rows."""

import pytest
from fastapi import HTTPException
from psycopg import AsyncConnection

from app.routers.admin_api import abort_matching, universe_detail, universe_groups
from tests.integration.test_me import add_pair, add_user


async def test_universe_detail_and_groups(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    a, b, c, d = [await add_user(conn, test_universe, n) for n in ("Ana", "Ben", "Cal", "Dee")]
    waiting = await add_user(conn, test_universe, "Eve")
    await conn.execute("UPDATE agent_profiles SET private = '{}'::jsonb WHERE user_id = %s", (waiting,))
    await add_pair(conn, test_universe, a, b, 9.0)
    await add_pair(conn, test_universe, b, c, 6.5)
    await add_pair(conn, test_universe, a, d, 8.0)  # d's only strong tie, but d is left out
    group = (
        await (
            await conn.execute(
                "INSERT INTO groups (universe_id, group_score, rationale) VALUES (%s, 8, 'fine') RETURNING id",
                (test_universe,),
            )
        ).fetchone()
    )["id"]
    for u in (a, b, c):
        await conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group, u))
    await conn.execute("UPDATE universes SET status = 'matched' WHERE id = %s", (test_universe,))
    await conn.commit()

    universe = await universe_detail(test_universe, conn)
    assert universe["stats"]["members"] == 5
    assert universe["stats"]["onboarded"] == 4
    assert universe["stats"]["pairs"] == 3
    assert (universe["stats"]["placed"], universe["stats"]["unplaced"]) == (3, 1)
    by_name = {m["full_name"]: m for m in universe["members"]}
    assert by_name["Ana"]["group"] == "g-01"
    assert by_name["Dee"]["group"] is None and by_name["Dee"]["strong_ties"] == 1
    assert by_name["Eve"]["status"] in ("invited", "chatting")

    groups = await universe_groups(test_universe, conn)
    [g] = groups["groups"]
    assert g["label"] == "g-01"
    assert (g["weakest_tie"]["a"], g["weakest_tie"]["b"]) in (("Ben", "Cal"), ("Cal", "Ben"))
    assert [p["full_name"] for p in groups["leftovers"]] == ["Dee"]


async def test_abort_matching_reopens_onboarding_and_drops_partial_results(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    a, b = [await add_user(conn, test_universe, n) for n in ("Ana", "Ben")]
    await add_pair(conn, test_universe, a, b, 7.0)
    await conn.execute("UPDATE universes SET status = 'matching' WHERE id = %s", (test_universe,))
    await conn.commit()

    assert await abort_matching(test_universe, conn) == {"status": "onboarding"}
    universe = await universe_detail(test_universe, conn)
    assert universe["status"] == "onboarding"
    assert universe["stats"]["pairs"] == 0

    with pytest.raises(HTTPException) as err:
        await abort_matching(test_universe, conn)
    assert err.value.status_code == 409
