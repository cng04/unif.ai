import numpy as np

from app.matching.groups import build_groups
from app.matching.keywords import Keyword
from app.matching.projection import project_3d
from app.matching.scoring import KeywordScore, PersonSignals, Signals, candidate_pairs, hard_conflicts, to_signals


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

    assert candidate_pairs(scores, blocked, top_m=1) == [(0, 1), (2, 3)]

    blocked[0, 1] = blocked[1, 0] = True
    pairs = candidate_pairs(scores, blocked, top_m=1)
    assert (0, 1) not in pairs


def test_to_signals_matches_keywords_case_insensitively_and_defaults_to_no_signal():
    keywords = [Keyword(name="Climbing", description=""), Keyword(name="Heavy drinking", description="")]
    person = PersonSignals(scores=[KeywordScore(keyword="climbing", score=0.9)], dealbreakers=["heavy Drinking"])

    s = to_signals([person], keywords)

    assert s.scores.tolist() == [[0.9, 0.5]]
    assert s.dealbreakers.tolist() == [[False, True]]


def test_project_3d_shape():
    assert project_3d(np.random.default_rng(0).random((5, 12))).shape == (5, 3)
