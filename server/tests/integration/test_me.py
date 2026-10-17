"""Per-user endpoints: each person sees only their own pairs, and nothing private leaks."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app.routers.me import get_connections, get_pair


async def add_user(conn: AsyncConnection, universe_id, name: str, looking_for: str = ""):
    user_id = uuid4()
    await conn.execute(
        "INSERT INTO users (id, universe_id, full_name) VALUES (%s, %s, %s)", (user_id, universe_id, name)
    )
    await conn.execute(
        "INSERT INTO agent_profiles (user_id, public, private) VALUES (%s, %s, %s)",
        (user_id, Jsonb({"name": name, "looking_for": looking_for}), Jsonb({"dealbreakers": ["secret"]})),
    )
    return user_id


async def add_pair(conn: AsyncConnection, universe_id, x, y, vibe: float, flags: list[str] | None = None):
    a, b = sorted([x, y])
    row = await (
        await conn.execute(
            "INSERT INTO pairs (universe_id, user_a, user_b, vibe_score, logistics_fit, dealbreaker_flags, "
            "judge_rationale) VALUES (%s, %s, %s, %s, 'strong', %s, 'dealbreakers: secret') RETURNING id",
            (universe_id, a, b, vibe, Jsonb(flags or [])),
        )
    ).fetchone()
    return row["id"]


@pytest.fixture
async def world(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    me = await add_user(conn, test_universe, "Cyn")
    maya = await add_user(conn, test_universe, "Maya", looking_for="climbing friends")
    ari = await add_user(conn, test_universe, "Ari")
    jo = await add_user(conn, test_universe, "Jo")
    with_maya = await add_pair(conn, test_universe, me, maya, 9.1)
    await add_pair(conn, test_universe, me, ari, 4.0, flags=["secret"])
    others_pair = await add_pair(conn, test_universe, maya, jo, 7.0)
    await conn.execute("INSERT INTO pair_messages (pair_id, speaker_id, kind, content) VALUES (%s, %s, 'message', 'hi')", (with_maya, maya))
    await conn.execute("INSERT INTO pair_messages (pair_id, speaker_id, kind, content) VALUES (%s, %s, 'note', 'private')", (with_maya, me))
    group = (await (await conn.execute("INSERT INTO groups (universe_id) VALUES (%s) RETURNING id", (test_universe,))).fetchone())["id"]
    for u in (me, maya):
        await conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group, u))
    await conn.commit()
    return {"me": me, "maya": maya, "ari": ari, "jo": jo, "with_maya": with_maya, "others_pair": others_pair}


async def test_connections_lists_only_my_pairs(test_db_conn, world):
    data = await get_connections(world["me"], test_db_conn)

    assert [c.full_name for c in data.connections] == ["Maya", "Ari"]
    maya, ari = data.connections
    assert maya.in_group and not maya.conflict
    assert ari.conflict and not ari.in_group
    assert set(data.others) == {world["maya"], world["ari"], world["jo"]}
    assert [(e.a, e.b) for e in data.edges] == [tuple(sorted([world["maya"], world["jo"]]))]
    assert "secret" not in data.model_dump_json()


async def test_pair_hides_notes_and_private_fields(test_db_conn, world):
    pair = await get_pair(world["me"], world["with_maya"], test_db_conn)

    assert [m.content for m in pair.messages] == ["hi"]
    assert pair.looking_for == "climbing friends"
    assert pair.in_group
    assert "secret" not in pair.model_dump_json()


async def test_pair_is_404_for_non_members(test_db_conn, world):
    with pytest.raises(HTTPException) as e:
        await get_pair(world["me"], world["others_pair"], test_db_conn)
    assert e.value.status_code == 404
