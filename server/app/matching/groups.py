"""Step 4: CP-SAT partitions people into groups using only judged edges, then the judge reviews each group whole."""

from ortools.sat.python import cp_model
from unifai_agent import AgentProfile, GroupVerdict, Judge, Verdict

PairKey = tuple[str, str]

WEIGHT_SCALE = 1000  # CP-SAT needs integer objective coefficients


def build_groups(
    user_ids: list[str],
    weights: dict[PairKey, float],
    forbidden: set[PairKey],
    min_size: int,
    max_size: int,
    time_limit_s: float = 10.0,
) -> list[list[str]]:
    """Place as many people as possible into groups of min-max size with no forbidden pair sharing a group,
    then, holding that count fixed, maximize the total judge weight of pairs inside the same group.
    Pairs that were never judged contribute nothing."""
    n = len(user_ids)
    if n < min_size:
        return []
    index = {u: i for i, u in enumerate(user_ids)}
    slots = range(n // min_size)

    model = cp_model.CpModel()
    x = {(i, g): model.new_bool_var(f"x{i}_{g}") for i in range(n) for g in slots}
    used = [model.new_bool_var(f"used{g}") for g in slots]

    for i in range(n):
        model.add_at_most_one(x[i, g] for g in slots)
    for g in slots:
        size = sum(x[i, g] for i in range(n))
        model.add(size >= min_size * used[g])
        model.add(size <= max_size * used[g])

    # Groups are interchangeable, so order them by their lowest-index member: person i can only open
    # group g if someone before them is already in group g-1. This cuts the search space by ~G!.
    for g in slots:
        for i in range(n):
            if i < g:
                model.add(x[i, g] == 0)
            elif g:
                model.add(x[i, g] <= sum(x[j, g - 1] for j in range(i)))

    for a, b in forbidden:
        if a in index and b in index:
            for g in slots:
                model.add_bool_or([x[index[a], g].Not(), x[index[b], g].Not()])

    together = []
    for (a, b), w in weights.items():
        coeff = round(w * WEIGHT_SCALE)
        if coeff <= 0 or a not in index or b not in index or (a, b) in forbidden:
            continue
        for g in slots:
            both = model.new_bool_var(f"e{a}_{b}_{g}")
            model.add_implication(both, x[index[a], g])
            model.add_implication(both, x[index[b], g])
            together.append((coeff, both))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s / 2
    solver.parameters.num_workers = 8

    placed = sum(x.values())
    model.maximize(placed)
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []
    model.add(placed >= round(solver.objective_value))
    for var in [*x.values(), *used]:
        model.add_hint(var, solver.boolean_value(var))

    model.clear_objective()
    model.maximize(sum(c * v for c, v in together))
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []

    groups = [[u for u in user_ids if solver.value(x[index[u], g])] for g in slots]
    return [g for g in groups if g]


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
