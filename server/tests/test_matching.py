import numpy as np

from app.matching.groups import build_groups
from app.matching.projection import project_3d
from app.matching.scoring import candidate_pairs


def test_build_groups_separates_clusters_and_respects_caps():
    cluster_a = [f"a{i}" for i in range(5)]
    cluster_b = [f"b{i}" for i in range(5)]
    weights = {}
    for cluster in (cluster_a, cluster_b):
        for i, u in enumerate(cluster):
            for v in cluster[i + 1 :]:
                weights[(u, v)] = 0.9
    weights[("a0", "b0")] = 0.1

    groups = build_groups(cluster_a + cluster_b, weights, min_size=4, max_size=8)

    assert sorted(map(sorted, groups)) == [sorted(cluster_a), sorted(cluster_b)]


def test_small_communities_are_absorbed():
    users = [f"u{i}" for i in range(6)]
    weights = {(u, v): 0.8 for i, u in enumerate(users[:4]) for v in users[i + 1 : 4]}

    groups = build_groups(users, weights, min_size=4, max_size=8)

    assert all(len(g) >= 4 for g in groups)
    assert sorted(u for g in groups for u in g) == sorted(users)


def test_candidate_pairs_are_unique_and_ordered():
    scores = np.array([[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]])

    pairs = candidate_pairs(scores, neighbors=1)

    assert pairs == [(0, 1), (2, 3)]


def test_project_3d_shape():
    assert project_3d(np.random.default_rng(0).random((5, 12))).shape == (5, 3)
