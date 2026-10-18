"""Per-user endpoints: each person sees only their own pairs, and nothing private leaks."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app.routers.me import get_connections, get_graph, get_group, get_pair


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


async def add_scores(conn: AsyncConnection, universe_id, scores: dict):
    """scores: {user_id: [score per keyword]} over keywords k0, k1, k2."""
    ids = []
    for i in range(3):
        row = await (
            await conn.execute("INSERT INTO keywords (universe_id, name) VALUES (%s, %s) RETURNING id", (universe_id, f"k{i}"))
        ).fetchone()
        ids.append(row["id"])
    for user_id, values in scores.items():
        for kid, score in zip(ids, values):
            await conn.execute(
                "INSERT INTO keyword_scores (user_id, keyword_id, score, dealbreaker) VALUES (%s, %s, %s, true)",
                (user_id, kid, score),
            )
    await conn.commit()


async def test_graph_names_only_my_people(test_db_conn, test_universe, world):
    await add_scores(
        test_db_conn,
        test_universe,
        {world["me"]: [0.9, 0.5, 0.1], world["maya"]: [0.8, 0.6, 0.2], world["ari"]: [0.1, 0.9, 0.5], world["jo"]: [0.5, 0.5, 0.9]},
    )
    graph = await get_graph(world["me"], None, test_db_conn)

    kinds = {n.user_id: (n.kind, n.name) for n in graph.nodes}
    assert kinds[world["me"]] == ("me", "Cyn")
    assert kinds[world["maya"]] == ("group", "Maya")
    assert kinds[world["ari"]] == ("match", "Ari")
    assert kinds[world["jo"]] == ("pool", None)
    assert {(l.a, l.b, l.mine) for l in graph.links} >= {(world["me"], world["maya"], True)}
    assert "secret" not in graph.model_dump_json()
    assert "dealbreaker" not in graph.model_dump_json()

    by_axes = await get_graph(world["me"], "k0,k1,k2", test_db_conn)
    me = next(n for n in by_axes.nodes if n.kind == "me")
    assert (me.x, me.y, me.z) == pytest.approx((0.8, 0.0, -0.8))

    with pytest.raises(HTTPException) as e:
        await get_graph(world["me"], "k0,nope,k2", test_db_conn)
    assert e.value.status_code == 422


async def test_group_lists_members_and_hides_private_fields(test_db_conn, test_universe, world):
    await add_scores(
        test_db_conn,
        test_universe,
        {world["me"]: [0.9, 0.5, 0.1], world["maya"]: [0.8, 0.6, 0.2], world["ari"]: [0.1, 0.9, 0.5], world["jo"]: [0.5, 0.5, 0.9]},
    )
    group = await get_group(world["me"], test_db_conn)

    assert [(m.full_name, m.is_me) for m in group.members] == [("Cyn", True), ("Maya", False)]
    me, maya = group.members
    assert maya.pair_id == world["with_maya"] and maya.vibe_score == 9.1
    assert maya.shared_keywords == []  # every seeded keyword is marked as a dealbreaker
    assert group.agents_met == 2
    assert [(l.a, l.b) for l in group.links] == [tuple(sorted([world["me"], world["maya"]]))]
    assert "secret" not in group.model_dump_json()


async def test_group_is_404_when_not_placed(test_db_conn, world):
    with pytest.raises(HTTPException) as e:
        await get_group(world["ari"], test_db_conn)
    assert e.value.status_code == 404

