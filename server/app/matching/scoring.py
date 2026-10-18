"""Step 2: score each person on every keyword with Jev, drop conflicting pairs, and pick who is worth a chat."""

import logging
from dataclasses import dataclass
from typing import Literal

import numpy as np
from ortools.sat.python import cp_model
from pydantic import BaseModel
from typesafe_sdk import Noul, Score
from unifai_agent import YES, Jev

from app.matching.keywords import Keyword

log = logging.getLogger(__name__)

NO_SIGNAL = 0.5

# Five ordered levels with "no signal" in the middle, so the normalized score lands on NO_SIGNAL.
KEYWORD_LEVELS = [
    "Clearly does not describe them",
    "Leans toward not describing them",
    "The material gives no signal either way",
    "Leans toward describing them",
    "Clearly describes them",
]

Slot = Literal["weekday_daytime", "weekday_evening", "weekend_daytime", "weekend_evening"]
SLOTS: dict[Slot, str] = {
    "weekday_daytime": "weekday daytimes",
    "weekday_evening": "weekday evenings",
    "weekend_daytime": "weekend daytimes",
    "weekend_evening": "weekend evenings",
}


class KeywordScore(BaseModel):
    keyword: str
    score: float


class PersonSignals(BaseModel):
    scores: list[KeywordScore]
    dealbreakers: list[str] = []
    availability: list[Slot] = []


@dataclass
class Signals:
    scores: np.ndarray  # n x k, 0-1
    dealbreakers: np.ndarray  # n x k, bool
    availability: list[set[str]]


def score_person(jev: Jev, document: str, keywords: list[Keyword]) -> PersonSignals:
    """One Jev request per person: a Score per keyword, a dealbreaker Noul per keyword, and availability Nouls."""
    try:
        questions = {}
        for i, kw in enumerate(keywords):
            questions[f"score_{i}"] = Score(
                instructions=f'How well does "{kw.name}" ({kw.description}) describe this person?',
                criteria=KEYWORD_LEVELS,
            )
            questions[f"dealbreaker_{i}"] = Noul(
                instructions=f'Did this person say they could not stand a friend described by "{kw.name}" '
                f"({kw.description})?"
            )
        questions["availability_stated"] = Noul(instructions="Does the material say when this person is usually free?")
        for slot, label in SLOTS.items():
            questions[f"free_{slot}"] = Noul(instructions=f"Is this person usually free on {label}?")

        result = jev.system_one(document, questions)
        top = len(KEYWORD_LEVELS) - 1
        stated = result.nouls["availability_stated"].noul > YES
        return PersonSignals(
            scores=[
                KeywordScore(keyword=kw.name, score=result.scores[f"score_{i}"].score / top)
                for i, kw in enumerate(keywords)
            ],
            dealbreakers=[kw.name for i, kw in enumerate(keywords) if result.nouls[f"dealbreaker_{i}"].noul > YES],
            availability=[s for s in SLOTS if stated and result.nouls[f"free_{s}"].noul > YES],
        )
    except Exception:
        log.exception("Failed to score person with Jev")
        # Return default signals (no signal on any keyword)
        return PersonSignals(
            scores=[KeywordScore(keyword=kw.name, score=NO_SIGNAL) for kw in keywords],
            dealbreakers=[],
            availability=[],
        )


def to_signals(people: list[PersonSignals], keywords: list[Keyword]) -> Signals:
    names = [kw.name.strip().lower() for kw in keywords]
    scores, dealbreakers = [], []
    for p in people:
        by_name = {s.keyword.strip().lower(): s.score for s in p.scores}
        avoid = {d.strip().lower() for d in p.dealbreakers}
        scores.append([float(np.clip(by_name.get(n, NO_SIGNAL), 0, 1)) for n in names])
        dealbreakers.append([n in avoid for n in names])
    return Signals(
        scores=np.array(scores, dtype=float).reshape(len(people), len(keywords)),
        dealbreakers=np.array(dealbreakers, dtype=bool).reshape(len(people), len(keywords)),
        availability=[set(p.availability) for p in people],
    )


def hard_conflicts(signals: Signals) -> np.ndarray:
    """n x n bool: True where one person's dealbreaker describes the other, or their free time never overlaps."""
    present = (signals.scores > NO_SIGNAL).astype(int)
    dealbreaker = (signals.dealbreakers.astype(int) @ present.T) > 0
    conflict = dealbreaker | dealbreaker.T
    avail = signals.availability
    for i in range(len(avail)):
        for j in range(i + 1, len(avail)):
            if avail[i] and avail[j] and not avail[i] & avail[j]:
                conflict[i, j] = conflict[j, i] = True
    np.fill_diagonal(conflict, False)
    return conflict


def candidate_pairs(scores: np.ndarray, blocked: np.ndarray, top_m: int) -> list[tuple[int, int]]:
    """Give each person up to top_m unique outgoing proposals, without duplicate conversations.

    An A->B and B->A proposal can create only one undirected conversation; whichever direction is not selected
    gets another proposal slot. Incoming proposals do not count against a person's top_m, so popular people can
    appear in more than top_m conversations and the total can reach n * top_m.
    """
    n = len(scores)
    if n < 2:
        return []
    normed = scores / np.maximum(np.linalg.norm(scores, axis=1, keepdims=True), 1e-9)
    sim = normed @ normed.T
    sim[blocked] = -np.inf
    np.fill_diagonal(sim, -np.inf)
    edges = [(i, j) for i in range(n) for j in range(i + 1, n) if np.isfinite(sim[i, j])]
    if not edges:
        return []

    model = cp_model.CpModel()
    proposed = {
        (i, j): model.new_bool_var(f"proposal_{i}_{j}")
        for a, b in edges
        for i, j in ((a, b), (b, a))
    }
    for i, j in edges:
        model.add(proposed[i, j] + proposed[j, i] <= 1)
    for i in range(n):
        model.add(sum(var for (source, _), var in proposed.items() if source == i) <= top_m)

    count = sum(proposed.values())
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 1.0
    solver.parameters.num_workers = 8
    model.maximize(count)
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []

    max_count = round(solver.objective_value)
    model.add(count == max_count)
    for var in proposed.values():
        model.add_hint(var, solver.boolean_value(var))
    model.clear_objective()
    model.maximize(sum(round(float(sim[i, j]) * 1000) * var for (i, j), var in proposed.items()))
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []
    return sorted((min(i, j), max(i, j)) for (i, j), var in proposed.items() if solver.boolean_value(var))
