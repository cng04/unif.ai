"""Admin JSON: pipeline counts, unplaced members, group labels and weakest ties, all derived from stored rows."""

import json

import pytest
from fastapi import BackgroundTasks, HTTPException
from psycopg import AsyncConnection
from unifai_agent import Interviewer

from app import repo
from app.routers.admin_api import (
    ManualPersonIn,
    UniverseRename,
    abort_matching,
    add_person,
    delete_person,
    person_public,
    rename_universe,
    universe_detail,
    universe_groups,
    universe_scores,
)
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
    assert universe["stats"]["running"] == 0
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


async def test_rename_universe_trims_and_rejects_blank(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    out = await rename_universe(test_universe, UniverseRename(name="  LA Hacks 2026  "), conn)
    assert out["name"] == "LA Hacks 2026"
    assert (await universe_detail(test_universe, conn))["name"] == "LA Hacks 2026"

    with pytest.raises(HTTPException) as err:
        await rename_universe(test_universe, UniverseRename(name="   "), conn)
    assert err.value.status_code == 400


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


class FakeBuilderLLM:
    """Stands in for the profile builder's model: returns one fixed ProfileDraft and records what it was shown."""

    def __init__(self, private: dict):
        self.private = private
        self.seen: list[str] = []

    def generate(self, system, history, **kwargs):
        from unifai_agent.llm import LLMResponse

        self.seen.append(history[-1]["content"])
        draft = {"public": {"name": "whatever the model says", "interests": ["climbing"]}, "private": self.private}
        return LLMResponse(text=json.dumps(draft))


def person(**overrides) -> ManualPersonIn:
    return ManualPersonIn(**{"full_name": "  Bob Judge ", "transcript": "I climb, and I hate flaky plans.", **overrides})


async def test_add_person_builds_profile_and_returns_only_public(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    llm = FakeBuilderLLM({"dealbreakers": ["flaky plans"]})
    background = BackgroundTasks()
    links = {"instagram": "https://instagram.com/bob", "x": " "}
    out = await add_person(test_universe, person(phone="+15550100", social_links=links), background, conn, Interviewer(llm))

    assert out["public"]["name"] == "Bob Judge" and out["public"]["interests"] == ["climbing"]
    assert "private" not in out and "flaky" not in json.dumps(out, default=str)
    assert out["scraping"] == [] and not background.tasks  # no consent, no scrape
    assert "I climb" in llm.seen[0]

    row = await (
        await conn.execute(
            "SELECT u.phone, u.social_links, ap.private, ap.raw_sources FROM users u "
            "JOIN agent_profiles ap ON ap.user_id = u.id WHERE u.id = %s",
            (out["user_id"],),
        )
    ).fetchone()
    assert row["phone"] == "+15550100" and row["social_links"] == {"instagram": "https://instagram.com/bob"}
    assert row["private"]["dealbreakers"] == ["flaky plans"]
    assert row["raw_sources"]["source"] == "admin_manual"
    by_name = {m["full_name"]: m for m in (await universe_detail(test_universe, conn))["members"]}
    assert by_name["Bob Judge"]["status"] == "complete"


async def test_add_person_scrapes_only_with_consent_and_counts_as_onboarded(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    background = BackgroundTasks()
    out = await add_person(
        test_universe,
        person(
            social_links={"linkedin": "https://linkedin.com/in/bob", "instagram": "https://instagram.com/bob"},
            scrape_consent=True,
        ),
        background,
        conn,
        Interviewer(FakeBuilderLLM({})),  # nothing private came up in 30 seconds
    )
    assert out["scraping"] == ["linkedin"] and len(background.tasks) == 1
    status = await (
        await conn.execute(
            f"SELECT {repo.USER_STATUS_SQL} AS s FROM users u JOIN agent_profiles ap ON ap.user_id = u.id WHERE u.id = %s",
            (out["user_id"],),
        )
    ).fetchone()
    assert status["s"] == "complete"
    assert (await person_public(out["user_id"], conn))["scraped"] == []

    await delete_person(out["user_id"], conn)
    with pytest.raises(HTTPException) as err:
        await person_public(out["user_id"], conn)
    assert err.value.status_code == 404


async def test_add_person_refuses_while_matching_or_blank(test_db_conn: AsyncConnection, test_universe):
    conn = test_db_conn
    await conn.execute("UPDATE universes SET status = 'matching' WHERE id = %s", (test_universe,))
    await conn.commit()
    llm = FakeBuilderLLM({})
    with pytest.raises(HTTPException) as err:
        await add_person(test_universe, person(), BackgroundTasks(), conn, Interviewer(llm))
    assert err.value.status_code == 409 and not llm.seen

    await conn.execute("UPDATE universes SET status = 'matched' WHERE id = %s", (test_universe,))
    await conn.commit()
    with pytest.raises(HTTPException) as err:
        await add_person(test_universe, person(transcript="  "), BackgroundTasks(), conn, Interviewer(llm))
    assert err.value.status_code == 400 and not llm.seen
