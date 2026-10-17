"""Step 1: find k recurring features (themes, traits, hobbies, education, vibes) across everyone's profiles."""

from pydantic import BaseModel
from unifai_agent import LLM, AgentProfile

SYSTEM = """\
You are given every member's profile in a community. Find the {k} most useful recurring features \
(themes, traits, hobbies, education, vibes, social energy) that distinguish people and would help \
form compatible friend groups. Each feature must be scorable from 0 to 1 for any person.
"""


class Feature(BaseModel):
    name: str
    description: str


class FeatureSet(BaseModel):
    features: list[Feature]


def extract_features(llm: LLM, profiles: list[AgentProfile], k: int) -> list[Feature]:
    corpus = "\n".join(p.model_dump_json(exclude={"user_id", "temperature"}) for p in profiles)
    resp = llm.generate(
        SYSTEM.format(k=k), [{"role": "user", "content": corpus}], temperature=0.3, response_model=FeatureSet
    )
    return FeatureSet.model_validate_json(resp.text or "{}").features[:k]
