"""Step 4: turn pairwise verdicts into a weighted graph, run community detection, then judge each group as a whole."""

import networkx as nx
from unifai_agent import AgentProfile, GroupVerdict, Judge, Verdict

PairKey = tuple[str, str]


def build_groups(
    user_ids: list[str], weights: dict[PairKey, float], min_size: int, max_size: int
) -> list[list[str]]:
    graph = nx.Graph()
    graph.add_nodes_from(user_ids)
    graph.add_weighted_edges_from((a, b, w) for (a, b), w in weights.items() if w > 0)

    groups: list[list[str]] = []
    for community in nx.community.louvain_communities(graph, weight="weight", seed=0):
        groups.extend(_split(graph, set(community), max_size))
    return _absorb_small(graph, groups, min_size, max_size)


def _split(graph: nx.Graph, nodes: set[str], max_size: int, resolution: float = 1.0) -> list[list[str]]:
    if len(nodes) <= max_size:
        return [sorted(nodes)]
    resolution *= 1.5
    parts = nx.community.louvain_communities(graph.subgraph(nodes), weight="weight", resolution=resolution, seed=0)
    if len(parts) == 1:
        ordered = sorted(nodes)
        return [ordered[i : i + max_size] for i in range(0, len(ordered), max_size)]
    return [g for part in parts for g in _split(graph, set(part), max_size, resolution)]


def _absorb_small(graph: nx.Graph, groups: list[list[str]], min_size: int, max_size: int) -> list[list[str]]:
    full = [g for g in groups if len(g) >= min_size]
    stragglers = [u for g in groups if len(g) < min_size for u in g]
    leftover: list[str] = []
    for user in stragglers:
        best = max(
            (g for g in full if len(g) < max_size),
            key=lambda g: sum(graph.get_edge_data(user, v, {}).get("weight", 0) for v in g),
            default=None,
        )
        (best if best is not None else leftover).append(user)
    if leftover:
        full.append(leftover)
    return full


def review_groups(
    judge: Judge,
    groups: list[list[str]],
    profiles: dict[str, AgentProfile],
    verdicts: dict[PairKey, Verdict],
    min_size: int,
) -> list[tuple[list[str], GroupVerdict]]:
    """Re-judge each candidate group as a whole and drop one misfit if the judge names one."""
    reviewed = []
    for members in groups:
        verdict = _judge_group(judge, members, profiles, verdicts)
        if not verdict.works and verdict.remove_user_id in members and len(members) > min_size:
            members = [m for m in members if m != verdict.remove_user_id]
            verdict = _judge_group(judge, members, profiles, verdicts)
        reviewed.append((members, verdict))
    return reviewed


def _judge_group(
    judge: Judge, members: list[str], profiles: dict[str, AgentProfile], verdicts: dict[PairKey, Verdict]
) -> GroupVerdict:
    member_set = set(members)
    pair_verdicts = {k: v for k, v in verdicts.items() if k[0] in member_set and k[1] in member_set}
    return judge.evaluate_group([profiles[m] for m in members], pair_verdicts)
