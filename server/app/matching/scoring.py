"""Step 2: score each person on every keyword, drop conflicting pairs, and pick who is worth an agent conversation."""

from dataclasses import dataclass
from typing import Literal

import numpy as np
from pydantic import BaseModel
from unifai_agent import LLM

from app.matching.keywords import Keyword

NO_SIGNAL = 0.5

Slot = Literal["weekday_daytime", "weekday_evening", "weekend_daytime", "weekend_evening"]

SYSTEM = f"""\
Read this person's onboarding material and fill in three things.

scores: rate them from 0 to 1 on every keyword below, where 1 means it strongly describes them, \
0 means it clearly does not, and {NO_SIGNAL} means the material gives no signal.
dealbreakers: the keywords (exact names from the list) that they could not stand in a friend, \
based only on dealbreakers they actually stated.
availability: the slots when they are usually free. Leave it empty if they never said.

Keywords:
{{keywords}}
"""


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


def score_person(llm: LLM, document: str, keywords: list[Keyword]) -> PersonSignals:
    listing = "\n".join(f"- {kw.name}: {kw.description}" for kw in keywords)
    resp = llm.generate(
        SYSTEM.format(keywords=listing),
        [{"role": "user", "content": document}],
        temperature=0.1,
        response_model=PersonSignals,
    )
    return PersonSignals.model_validate_json(resp.text or "{}")


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
    """Each person's top-M most similar non-conflicting people by cosine similarity, as sorted index pairs."""
    n = len(scores)
    if n < 2:
        return []
    normed = scores / np.maximum(np.linalg.norm(scores, axis=1, keepdims=True), 1e-9)
    sim = normed @ normed.T
    sim[blocked] = -np.inf
    np.fill_diagonal(sim, -np.inf)
    pairs: set[tuple[int, int]] = set()
    for i in range(n):
        for j in np.argsort(sim[i])[::-1][:top_m]:
            if np.isfinite(sim[i, j]):
                pairs.add((min(i, int(j)), max(i, int(j))))
    return sorted(pairs)
