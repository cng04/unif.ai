from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest

from app.matching.groups import build_groups
from app.matching.keywords import Keyword
from app.matching.pairing import _temperature_for_chat
from app.matching.pipeline import save_signals
from app.matching.projection import project_3d
from app.matching.scoring import (
    KeywordScore,
    PersonSignals,
    Signals,
    candidate_pairs,
    hard_conflicts,
    score_person,
    to_signals,
)


class FakeJev:
    """Answers each question by name: Score -> level index, Noul -> probability."""

    def __init__(self, answers: dict):
        self.answers = answers

    def system_one(self, state, questions):
        return SimpleNamespace(
            scores={n: SimpleNamespace(score=self.answers.get(n, 2)) for n, q in questions.items() if q.type == "score"},
            nouls={n: SimpleNamespace(noul=self.answers.get(n, 0.1)) for n, q in questions.items() if q.type == "noul"},
        )


KEYWORDS = [Keyword(name="climbing", description="rock climbing"), Keyword(name="heavy drinking", description="")]


def test_score_person_normalizes_scores_and_reads_nouls():
    jev = FakeJev({"score_0": 4, "dealbreaker_1": 0.9, "availability_stated": 0.9, "free_weekend_daytime": 0.8})

    signals = score_person(jev, "doc", KEYWORDS)

    assert [s.score for s in signals.scores] == [1.0, 0.5]
    assert signals.dealbreakers == ["heavy drinking"]
    assert signals.availability == ["weekend_daytime"]


def test_score_person_ignores_free_slots_when_availability_was_never_stated():
    jev = FakeJev({"availability_stated": 0.2, "free_weekend_daytime": 0.9})

    assert score_person(jev, "doc", KEYWORDS).availability == []


def clique(users: list[str], weight: float) -> dict[tuple[str, str], float]:
    return {(u, v): weight for i, u in enumerate(users) for v in users[i + 1 :]}


def test_build_groups_separates_clusters_and_respects_caps():
    cluster_a = [f"a{i}" for i in range(5)]
    cluster_b = [f"b{i}" for i in range(5)]
    weights = {**clique(cluster_a, 0.9), **clique(cluster_b, 0.9), ("a0", "b0"): 0.1}

    groups = build_groups(cluster_a + cluster_b, weights, set(), min_size=4, max_size=8)

    assert sorted(map(sorted, groups)) == [sorted(cluster_a), sorted(cluster_b)]


def test_build_groups_places_people_with_no_judged_edges():
    users = [f"u{i}" for i in range(6)]

    groups = build_groups(users, clique(users[:4], 0.8), set(), min_size=4, max_size=8)

    assert sorted(u for g in groups for u in g) == users
    assert all(4 <= len(g) <= 8 for g in groups)


def test_default_group_size_allows_groups_of_three():
    from app.config import Settings

    assert Settings(_env_file=None).min_group_size == 3


def test_build_groups_never_combines_forbidden_pairs():
    users = [f"u{i}" for i in range(8)]
    forbidden = {("u0", "u1")}

    groups = build_groups(users, clique(users, 0.9), forbidden, min_size=4, max_size=8)

    assert sorted(u for g in groups for u in g) == users
    assert not any({"u0", "u1"} <= set(g) for g in groups)


def test_build_groups_leaves_out_people_who_cannot_fit():
    users = [f"u{i}" for i in range(5)]
    forbidden = {("u0", v) for v in users[1:]}

    groups = build_groups(users, clique(users, 0.9), forbidden, min_size=4, max_size=8)

    assert [sorted(g) for g in groups] == [users[1:]]


def signals(scores, dealbreakers=None, availability=None) -> Signals:
    scores = np.array(scores, dtype=float)
    return Signals(
        scores=scores,
        dealbreakers=np.array(dealbreakers if dealbreakers is not None else np.zeros_like(scores), dtype=bool),
        availability=availability or [set() for _ in scores],
    )


async def test_save_signals_casts_serial_keyword_ids_as_integers():
    class Result:
        async def fetchall(self):
            return [{"id": 1}, {"id": 2}]

    class Cursor:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def executemany(self, *_):
            return None

    class Connection:
        def __init__(self):
            self.queries = []

        async def execute(self, query, params):
            self.queries.append(query)
            return Result()

        def cursor(self):
            return Cursor()

        async def commit(self):
            return None

    conn = Connection()
    await save_signals(conn, uuid4(), [str(uuid4())], KEYWORDS, signals([[0.9, 0.1]]))

    insert = next(q for q in conn.queries if "INSERT INTO keyword_scores" in q)
    assert "unnest(%s::uuid[]), unnest(%s::int[])" in insert


def test_hard_conflicts_from_dealbreaker_keywords():
    # person 0 can't stand keyword 1; person 1 scores high on it, person 2 gives no signal
    s = signals([[0.9, 0.1], [0.8, 0.9], [0.8, 0.5]], dealbreakers=[[False, True], [False, False], [False, False]])

    conflicts = hard_conflicts(s)

    assert conflicts[0, 1] and conflicts[1, 0]
    assert not conflicts[0, 2] and not conflicts[1, 2]


def test_hard_conflicts_from_availability():
    s = signals(
        [[0.5], [0.5], [0.5]],
        availability=[{"weekday_evening"}, {"weekend_daytime"}, set()],
    )

    conflicts = hard_conflicts(s)

    assert conflicts[0, 1]
    assert not conflicts[0, 2] and not conflicts[1, 2]


def test_candidate_pairs_are_unique_ordered_and_skip_blocked():
    scores = np.array([[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]])
    blocked = np.zeros((4, 4), dtype=bool)

    pairs = candidate_pairs(scores, blocked, top_m=1)
    assert len(pairs) == len(set(pairs)) == 4
    assert all(i < j for i, j in pairs)

    blocked[0, 1] = blocked[1, 0] = True
    pairs = candidate_pairs(scores, blocked, top_m=1)
    assert (0, 1) not in pairs


def test_candidate_pairs_replace_reciprocal_proposals_without_total_degree_cap():
    scores = np.ones((6, 2))
    blocked = np.zeros((6, 6), dtype=bool)

    pairs = candidate_pairs(scores, blocked, top_m=2)
    degree = [sum(i in pair for pair in pairs) for i in range(6)]

    assert len(pairs) == len(set(pairs)) == 12
    assert max(degree) > 2


def test_to_signals_matches_keywords_case_insensitively_and_defaults_to_no_signal():
    keywords = [Keyword(name="Climbing", description=""), Keyword(name="Heavy drinking", description="")]
    person = PersonSignals(scores=[KeywordScore(keyword="climbing", score=0.9)], dealbreakers=["heavy Drinking"])

    s = to_signals([person], keywords)

    assert s.scores.tolist() == [[0.9, 0.5]]
    assert s.dealbreakers.tolist() == [[False, True]]


def test_project_3d_shape():
    assert project_3d(np.random.default_rng(0).random((5, 12))).shape == (5, 3)


class FakeGroupJudge:
    def __init__(self, verdicts):
        self.verdicts = list(verdicts)
        self.calls = 0

    def evaluate_group(self, profiles, pair_verdicts):
        self.calls += 1
        v = self.verdicts.pop(0)
        if isinstance(v, Exception):
            raise v
        return v


def _group_verdict(**kw):
    from unifai_agent import GroupVerdict

    return GroupVerdict(**{"works": True, "group_score": 8, "rationale": "ok", **kw})


def test_review_groups_survives_judge_failure():
    from app.matching.groups import review_groups

    judge = FakeGroupJudge([RuntimeError("bad json")])
    profiles = {m: object() for m in "abcd"}
    out = review_groups(judge, [list("abcd")], profiles, {}, min_size=4)
    assert out[0][0] == list("abcd")
    assert out[0][1].works


def test_review_groups_drops_named_misfit_and_rejudges():
    from app.matching.groups import review_groups

    judge = FakeGroupJudge([_group_verdict(works=False, remove_user_id="e"), _group_verdict()])
    profiles = {m: object() for m in "abcde"}
    out = review_groups(judge, [list("abcde")], profiles, {}, min_size=4)
    assert out[0][0] == list("abcd")
    assert judge.calls == 2


def test_review_groups_keeps_group_at_min_size():
    from app.matching.groups import review_groups

    judge = FakeGroupJudge([_group_verdict(works=False, remove_user_id="d")])
    profiles = {m: object() for m in "abcd"}
    out = review_groups(judge, [list("abcd")], profiles, {}, min_size=4)
    assert out[0][0] == list("abcd")
    assert judge.calls == 1


async def test_photon_logs_instead_of_raising(monkeypatch):
    from app.config import Settings
    from app.services import photon

    monkeypatch.setattr(photon, "get_settings", lambda: Settings(photon_api_key="key"))
    assert await photon.send_message("+15550001111", "hi", "k") is False


def fake_photon(monkeypatch, spaces: list[dict], send_status: int = 200, send_body: dict | None = None) -> list:
    """Point the Photon client at a fake API; returns the list of message POSTs it receives."""
    import httpx

    from app.config import Settings
    from app.services import photon

    sent = []

    def handle(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/spaces"):
            assert request.url.params["participantHandle"] == "+15550001111"
            return httpx.Response(200, json={"items": spaces})
        if "/users/" in path:
            uid = path.rsplit("/", 1)[1]
            if uid == "agent-1":
                return httpx.Response(200, json={"id": uid, "kind": "agent"})
            handle = "+15550001111" if uid == "human-1" else "+15559998888"
            return httpx.Response(200, json={"id": uid, "kind": "human", "handle": handle})
        if path.endswith("/messages"):
            sent.append(request)
            return httpx.Response(send_status, json=send_body or {"id": "m1"})
        return httpx.Response(404)

    monkeypatch.setattr(photon, "get_settings", lambda: Settings(photon_api_key="key", photon_project_id="proj"))
    monkeypatch.setattr(photon, "_client", lambda: httpx.AsyncClient(base_url=photon.API, transport=httpx.MockTransport(handle)))
    return sent


async def test_photon_sends_into_the_existing_space_as_the_agent(monkeypatch):
    import json

    from app.services import photon

    sent = fake_photon(monkeypatch, [{"id": "space-1", "kind": "direct", "participantIds": ["human-1", "agent-1"]}])
    assert await photon.send_message("+15550001111", "hi", "matched:g:u") is True

    [req] = sent
    assert req.headers["idempotency-key"] == "matched:g:u"
    body = json.loads(req.content)
    assert body == {"spaceId": "space-1", "senderId": "agent-1", "content": {"type": "text", "format": "plain", "text": "hi"}}


async def test_photon_skips_people_who_never_texted_the_line(monkeypatch):
    from app.services import photon

    sent = fake_photon(monkeypatch, [])
    assert await photon.send_message("+15550001111", "hi", "k") is False
    assert sent == []


async def test_photon_never_texts_someone_elses_space(monkeypatch):
    import json

    # If the participant filter doesn't match, Photon can list other people's spaces; those must not get the text.
    from app.services import photon

    stranger = {"id": "space-2", "kind": "direct", "participantIds": ["human-2", "agent-1"]}
    sent = fake_photon(monkeypatch, [stranger])
    assert await photon.send_message("+15550001111", "hi", "k") is False
    assert sent == []

    own = {"id": "space-1", "kind": "direct", "participantIds": ["human-1", "agent-1"]}
    sent = fake_photon(monkeypatch, [stranger, own])
    assert await photon.send_message("+15550001111", "hi", "k") is True
    assert [json.loads(r.content)["spaceId"] for r in sent] == ["space-1"]


async def test_matched_text_greets_the_recipient_not_the_others(monkeypatch):
    from app.services import photon

    texts = {}

    async def deliver(member, text, key):
        texts[member["full_name"]] = text
        return True

    monkeypatch.setattr(photon, "deliver", deliver)
    members = [
        {"user_id": "u1", "full_name": "Ada Lovelace", "phone": "+1", "asi_address": None},
        {"user_id": "u2", "full_name": "Grace Hopper", "phone": "+2", "asi_address": None},
    ]
    await photon.notify_group("g", members, [])
    assert texts["Ada Lovelace"].startswith("You've been matched, Ada!")
    assert texts["Grace Hopper"].startswith("You've been matched, Grace!")
    assert "Grace" not in texts["Ada Lovelace"] and "Ada" not in texts["Grace Hopper"]


async def test_photon_treats_a_reused_key_as_already_sent(monkeypatch):
    from app.services import photon

    space = {"id": "space-1", "kind": "direct", "participantIds": ["human-1", "agent-1"]}
    fake_photon(monkeypatch, [space], send_status=422, send_body={"code": "IDEMPOTENCY_KEY_REUSED"})
    assert await photon.send_message("+15550001111", "hi", "k") is True
    fake_photon(monkeypatch, [space], send_status=403, send_body={"code": "SHARED_LINE_INBOUND_REQUIRED"})
    assert await photon.send_message("+15550001111", "hi", "k") is False


def test_chat_llms_use_bounded_max_tokens_and_rotate_models(monkeypatch):
    from app import deps
    from app.config import Settings

    deps.get_chat_llms.cache_clear()
    monkeypatch.setattr(
        deps,
        "get_settings",
        lambda: Settings(
            openrouter_api_key="key",
            openrouter_chat_model="google/gemini-3.8-flash,google/gemini-3.7-flash",
            openrouter_chat_temperatures="0.4,1.1",
            openrouter_chat_temperature_jitter=0.08,
            openrouter_chat_max_tokens=512,
        ),
    )
    llms = deps.get_chat_llms()
    deps.get_chat_llms.cache_clear()

    assert [m.model for m in llms] == ["google/gemini-3.8-flash", "google/gemini-3.7-flash"]
    assert all(m.max_tokens == 512 for m in llms)
    assert [m.chat_temperature for m in llms] == [0.4, 1.1]
    assert all(m.temperature_jitter == 0.08 for m in llms)


def test_pair_temperature_is_randomized_once_around_model_base(monkeypatch):
    monkeypatch.setattr("app.matching.pairing.random.uniform", lambda low, high: 0.06)
    llm = SimpleNamespace(chat_temperature=0.8, temperature_jitter=0.08)

    assert _temperature_for_chat(llm) == pytest.approx(0.86)


def test_openrouter_jev_ignores_chat_models_and_falls_back(monkeypatch, caplog):
    from app import deps
    from app.config import Settings

    deps.get_jevs.cache_clear()
    monkeypatch.setattr(
        deps,
        "get_settings",
        lambda: Settings(
            openrouter_api_key="key",
            openrouter_jev_model="google/gemini-3.8-flash,anthropic/claude-haiku-5.5",
        ),
    )
    jevs = deps.get_jevs()
    deps.get_jevs.cache_clear()

    assert [m.model for m in jevs] == ["~typesafe/jev-latest"]
    assert "Ignoring non-Jev OPENROUTER_JEV_MODEL entries" in caplog.text



async def test_plan_lock_texts_each_member_once_with_their_link(monkeypatch):
    from app.config import Settings
    from app.services import photon

    sent = []

    async def fake_send(phone, text, key):
        sent.append((phone, text, key))
        return True

    monkeypatch.setattr(photon, "send_message", fake_send)
    monkeypatch.setattr(photon, "get_settings", lambda: Settings(client_url="https://app.test/"))
    event = {"id": "e1", "name": "sunrise hike", "time_label": "sat 24 · 08:00", "venue": "canyon trailhead"}
    members = [{"user_id": "u1", "full_name": "A", "phone": "+1"}, {"user_id": "u2", "full_name": "B", "phone": None}]
    await photon.notify_plan_locked("g1", event, members, 2)

    assert sent == [
        (
            "+1",
            "It's on: sunrise hike, sat 24 · 08:00, canyon trailhead. 2 of 2 are in."
            " Details: https://app.test/u/u1/group/show-up",
            "plan-locked:e1:u1",
        )
    ]


async def test_match_text_goes_to_imessage_or_asi_one_by_how_they_joined(monkeypatch):
    from app.config import Settings
    from app.services import asi, photon

    sent = []

    async def fake_photon(phone, text, key):
        sent.append(("imessage", phone, key))
        return True

    async def fake_asi(address, text, key):
        sent.append(("asi", address, key))
        return True

    monkeypatch.setattr(photon, "send_message", fake_photon)
    monkeypatch.setattr(asi, "send_message", fake_asi)
    monkeypatch.setattr(photon, "get_settings", lambda: Settings(client_url="https://app.test"))
    members = [
        {"user_id": "u1", "full_name": "A", "phone": "+1", "asi_address": None},
        {"user_id": "u2", "full_name": "B", "phone": None, "asi_address": "agent1qabc"},
        {"user_id": "u3", "full_name": "C", "phone": None, "asi_address": None},
    ]
    await photon.notify_group("g1", members, [])

    key = photon.lineup_key(members)
    assert sent == [("imessage", "+1", f"matched:{key}:u1"), ("asi", "agent1qabc", f"matched:{key}:u2")]


def test_match_key_follows_the_lineup_not_the_group_id():
    from app.services import photon

    abc = [{"user_id": u} for u in ("a", "b", "c")]
    assert photon.lineup_key(abc) == photon.lineup_key(list(reversed(abc)))
    assert photon.lineup_key(abc) != photon.lineup_key(abc[:2] + [{"user_id": "d"}])


async def test_asi_send_posts_to_the_relay_agent(monkeypatch):
    import json

    import httpx

    from app.config import Settings
    from app.services import asi

    posts = []

    def handle(request: httpx.Request) -> httpx.Response:
        posts.append(json.loads(request.content))
        return httpx.Response(200, json={"sent": True, "error": ""})

    monkeypatch.setattr(asi, "get_settings", lambda: Settings(asi_notify_url="http://agent.test/notify", relay_token="t"))
    monkeypatch.setattr(asi, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handle)))
    assert await asi.send_message("agent1qabc", "hi", "matched:g:u") is True
    assert posts == [{"address": "agent1qabc", "text": "hi", "key": "matched:g:u", "token": "t"}]

    monkeypatch.setattr(asi, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    assert await asi.send_message("agent1qabc", "hi", "k") is False
