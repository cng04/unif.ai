"""Admin JSON: pipeline counts, unplaced members, group labels and weakest ties, all derived from stored rows."""

import pytest
from fastapi import HTTPException
from psycopg import AsyncConnection

from app.routers.admin_api import abort_matching, universe_detail, universe_groups, universe_scores
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


async def test_scores_are_keyword_level_only(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    a, b = [await add_user(conn, test_universe, n) for n in ("Ana", "Ben")]
    unscored = await add_user(conn, test_universe, "Cal")
    ids = {}
    for name in ("climbing", "late nights"):
        row = await (
            await conn.execute(
                "INSERT INTO keywords (universe_id, name) VALUES (%s, %s) RETURNING id", (test_universe, name)
            )
        ).fetchone()
        ids[name] = row["id"]
    for user, climbing, late, avoids_late in ((a, 0.9, 0.1, True), (b, 0.4, 0.8, False)):
        await conn.execute(
            "INSERT INTO keyword_scores (user_id, keyword_id, score, dealbreaker) VALUES (%s, %s, %s, false), (%s, %s, %s, %s)",
            (user, ids["climbing"], climbing, user, ids["late nights"], late, avoids_late),
        )
    await conn.commit()

    out = await universe_scores(test_universe, conn)
    assert out["keywords"] == ["climbing", "late nights"]
    by_user = {m["user_id"]: m for m in out["members"]}
    assert unscored not in by_user
    assert by_user[a]["scores"] == pytest.approx({"climbing": 0.9, "late nights": 0.1})  # REAL column
    assert by_user[a]["dealbreakers"] == ["late nights"]
    assert by_user[b]["dealbreakers"] == []
    # The profile's private dealbreaker text is never part of the response.
    private = (await (await conn.execute("SELECT private FROM agent_profiles WHERE user_id = %s", (a,))).fetchone())["private"]
    for text in private.get("dealbreakers", []):
        assert text not in str(out)
