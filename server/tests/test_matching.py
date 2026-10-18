from types import SimpleNamespace
from uuid import uuid4

import numpy as np

from app.matching.groups import build_groups
from app.matching.keywords import Keyword
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
    await photon.send_message("+15550001111", "hi")


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
            openrouter_chat_max_tokens=512,
        ),
    )
    llms = deps.get_chat_llms()
    deps.get_chat_llms.cache_clear()

    assert [m.model for m in llms] == ["google/gemini-3.8-flash", "google/gemini-3.7-flash"]
    assert all(m.max_tokens == 512 for m in llms)


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

