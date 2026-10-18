"""World snapshot: admin vs participant views, live chat lifecycle, matching stage, demo/real filtering."""

import pytest
from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app import repo
from app.matching.pipeline import drop_running_pair, save_pair, start_pair
from app.routers.admin_api import list_universes
from app.routers.world import admin_world, build_world, participant_world
from tests.integration.test_me import add_pair, add_user
from unifai_agent.conversation import Transcript
from unifai_agent.judge import Verdict


async def add_keyword(conn: AsyncConnection, universe_id, name: str, scores: dict) -> None:
    row = await (
        await conn.execute("INSERT INTO keywords (universe_id, name) VALUES (%s, %s) RETURNING id", (universe_id, name))
    ).fetchone()
    for user, (score, dealbreaker) in scores.items():
        await conn.execute(
            "INSERT INTO keyword_scores (user_id, keyword_id, score, dealbreaker) VALUES (%s, %s, %s, %s)",
            (user, row["id"], score, dealbreaker),
        )


@pytest.fixture
async def world(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    cyn = await add_user(conn, test_universe, "Cyn Lee", looking_for="climbing friends")
    maya = await add_user(conn, test_universe, "Maya")
    ari = await add_user(conn, test_universe, "Ari")
    await conn.execute(
        "UPDATE agent_profiles SET public = public || %s WHERE user_id = %s",
        (Jsonb({"interests": ["climbing", "coffee"]}), cyn),
    )
    await add_keyword(conn, test_universe, "climbing", {cyn: (0.9, False), maya: (0.8, False), ari: (0.2, False)})
    await add_keyword(conn, test_universe, "late nights", {cyn: (0.1, True), maya: (0.4, False), ari: (0.9, False)})
    mine = await add_pair(conn, test_universe, cyn, maya, 9.1)
    theirs = await add_pair(conn, test_universe, maya, ari, 5.0, flags=["late nights"])
    group = (
        await (
            await conn.execute(
                "INSERT INTO groups (universe_id, group_score, rationale) VALUES (%s, 8, 'judge says secret') RETURNING id",
                (test_universe,),
            )
        ).fetchone()
    )["id"]
    for u in (cyn, maya):
        await conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group, u))
    await conn.commit()
    return {"cyn": cyn, "maya": maya, "ari": ari, "mine": mine, "theirs": theirs}


async def test_admin_view_has_everything_but_private_text(test_db_conn, test_universe, world):
    out = await build_world(test_db_conn, test_universe)
    assert out["viewer"] is None
    climbing = next(k for k in out["keywords"] if k["name"] == "climbing")
    assert climbing["people"] == 2  # Cyn and Maya above the 0.5 line
    cyn = next(m for m in out["members"] if m["id"] == world["cyn"])
    assert cyn["name"] == "Cyn"  # first name only
    assert cyn["top_keywords"] == ["climbing"]
    assert cyn["dealbreakers"] == ["late nights"]
    assert cyn["scores"]["climbing"] == pytest.approx(0.9)
    assert cyn["interests"] == ["climbing", "coffee"]
    theirs = next(p for p in out["pairs"] if p["id"] == world["theirs"])
    assert theirs["rationale"] and theirs["dealbreaker_flags"] == ["late nights"]
    [group] = out["groups"]
    assert group["label"] == "g-01" and group["rationale"] == "judge says secret"
    # Private profile text ("secret" in agent_profiles.private) is never read into the snapshot.
    assert "phone" not in str(out) and "'dealbreakers': ['secret']" not in str(out)


async def test_participant_view_hides_what_others_may_not_see(test_db_conn, test_universe, world):
    out = await build_world(test_db_conn, test_universe, viewer=world["cyn"])
    text = str(out)
    assert out["viewer"] == world["cyn"]
    assert all("scores" not in m and "dealbreakers" not in m for m in out["members"])
    assert all("dealbreakers" not in k for k in out["keywords"])
    assert "secret" not in text and "late nights" not in str([p for p in out["pairs"]])
    mine = next(p for p in out["pairs"] if p["a"] in (world["cyn"],) or p["b"] == world["cyn"])
    assert mine["id"] == world["mine"] and mine["vibe"] == pytest.approx(9.1)
    others = [p for p in out["pairs"] if world["cyn"] not in (p["a"], p["b"])]
    assert others and all(p["id"] is None and "vibe" not in p for p in others)
    [group] = out["groups"]  # Cyn's own group: score and plans, never the judge's rationale
    assert group["score"] == 8 and "rationale" not in group


async def test_participant_must_belong_to_universe(test_db_conn, test_universe, world):
    with pytest.raises(HTTPException) as err:
        await build_world(test_db_conn, test_universe, viewer=world["cyn"].__class__(int=1))
    assert err.value.status_code == 404


async def test_since_short_circuits_until_something_changes(test_db_conn, test_universe, world):
    first = await admin_world(test_universe, conn=test_db_conn)
    same = await admin_world(test_universe, since=first["version"], conn=test_db_conn)
    assert same == {"version": first["version"], "unchanged": True}
    viewer = await participant_world(world["cyn"], since=first["version"], conn=test_db_conn)
    assert viewer["unchanged"]
    await add_user(test_db_conn, test_universe, "Newcomer")
    await test_db_conn.commit()
    changed = await admin_world(test_universe, since=first["version"], conn=test_db_conn)
    assert "unchanged" not in changed and len(changed["members"]) == 4


async def test_chat_is_running_then_complete(test_db_conn, test_universe, world):
    conn = test_db_conn
    key = tuple(sorted([str(world["cyn"]), str(world["ari"])]))
    await start_pair(conn, test_universe, key)
    live = await build_world(conn, test_universe)
    running = [p for p in live["pairs"] if p["status"] == "running"]
    assert len(running) == 1 and running[0]["vibe"] is None and running[0]["completed_at"] is None

    transcript = Transcript(messages=[(key[0], "hi"), (key[1], "hey")], notes={key[0]: ["private note"]}, end_reason="done")
    verdict = Verdict(vibe_score=7.0, dealbreaker_conflicts=[], logistics_fit="workable", rationale="fine")
    await save_pair(conn, test_universe, key, transcript, verdict)
    done = await build_world(conn, test_universe)
    pair = next(p for p in done["pairs"] if {str(p["a"]), str(p["b"])} == set(key))
    assert pair["status"] == "complete" and pair["completed_at"] is not None and pair["vibe"] == 7.0
    assert "private note" not in str(done)


async def test_failed_chat_leaves_no_live_placeholder(test_db_conn, test_universe, world):
    key = tuple(sorted([str(world["cyn"]), str(world["ari"])]))
    await start_pair(test_db_conn, test_universe, key)
    await drop_running_pair(test_db_conn, test_universe, key)
    out = await build_world(test_db_conn, test_universe)
    assert all(p["status"] == "complete" for p in out["pairs"])


async def test_stage_is_recorded_and_cleared_when_the_run_ends(test_db_conn, test_universe):
    await repo.set_universe_status(test_db_conn, test_universe, "matching")
    await repo.set_matching_stage(test_db_conn, test_universe, "chats")
    out = await build_world(test_db_conn, test_universe)
    assert out["universe"]["stage"] == "chats" and out["universe"]["stage_at"] is not None
    await repo.set_universe_status(test_db_conn, test_universe, "matched")
    out = await build_world(test_db_conn, test_universe)
    assert out["universe"]["stage"] is None
    with pytest.raises(ValueError):
        await repo.set_matching_stage(test_db_conn, test_universe, "dancing")


async def test_demo_and_real_universes_never_mix(test_db_conn, test_universe):
    await test_db_conn.execute("UPDATE universes SET is_demo = true WHERE id = %s", (test_universe,))
    await test_db_conn.commit()
    demo = {u["id"] for u in await list_universes(mode="demo", conn=test_db_conn)}
    real = {u["id"] for u in await list_universes(mode="real", conn=test_db_conn)}
    assert test_universe in demo and test_universe not in real
    assert not demo & real
