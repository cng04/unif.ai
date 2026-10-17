"""Step 2: score each profile 0-1 on every feature, then pick which pairs are worth an agent conversation."""

import numpy as np
from pydantic import BaseModel
from unifai_agent import LLM, AgentProfile

from app.matching.features import Feature

SYSTEM = "Score this person from 0 to 1 on each feature below. Use 0.5 when the profile gives no signal.\n\n{features}"


class FeatureScore(BaseModel):
    feature: str
    score: float


class FeatureScores(BaseModel):
    scores: list[FeatureScore]


def score_profile(llm: LLM, profile: AgentProfile, features: list[Feature]) -> list[float]:
    feature_list = "\n".join(f"- {f.name}: {f.description}" for f in features)
    resp = llm.generate(
        SYSTEM.format(features=feature_list),
        [{"role": "user", "content": profile.model_dump_json(exclude={"user_id", "temperature"})}],
        temperature=0.1,
        response_model=FeatureScores,
    )
    by_name = {s.feature: s.score for s in FeatureScores.model_validate_json(resp.text or "{}").scores}
    return [float(np.clip(by_name.get(f.name, 0.5), 0, 1)) for f in features]


def score_profiles(llm: LLM, profiles: list[AgentProfile], features: list[Feature]) -> np.ndarray:
    return np.array([score_profile(llm, p, features) for p in profiles])


def candidate_pairs(scores: np.ndarray, neighbors: int) -> list[tuple[int, int]]:
    """Each person's nearest neighbors by cosine similarity, so we don't run O(n^2) conversations."""
    n = len(scores)
    if n < 2:
        return []
    normed = scores / np.maximum(np.linalg.norm(scores, axis=1, keepdims=True), 1e-9)
    sim = normed @ normed.T
    np.fill_diagonal(sim, -np.inf)
    pairs: set[tuple[int, int]] = set()
    for i in range(n):
        for j in np.argsort(sim[i])[::-1][: min(neighbors, n - 1)]:
            pairs.add((min(i, int(j)), max(i, int(j))))
    return sorted(pairs)
