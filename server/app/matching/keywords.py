"""Step 1: find k keywords (interests, values, traits, vibes, dealbreaker topics) across everyone's onboarding."""

import logging

from pydantic import BaseModel
from unifai_agent import LLM

log = logging.getLogger(__name__)

SYSTEM = """\
You are given the onboarding material (profile and interview transcript) for every member of a community. \
List the {k} keywords that best distinguish people and would help form compatible friend groups: \
interests, values, traits, social energy, and any topic that comes up as a dealbreaker \
(for example "heavy drinking" or "flaky plans"). Every keyword must be scorable from 0 to 1 for any person.
"""


class Keyword(BaseModel):
    name: str
    description: str


class KeywordSet(BaseModel):
    keywords: list[Keyword]


def extract_keywords(llm: LLM, documents: list[str], k: int) -> list[Keyword]:
    log.info("Extracting %d keywords from %d documents", k, len(documents))
    corpus = "\n\n---\n\n".join(documents)
    try:
        resp = llm.generate(
            SYSTEM.format(k=k), [{"role": "user", "content": corpus}], temperature=0.3, response_model=KeywordSet
        )
        unique: dict[str, Keyword] = {}
        for kw in KeywordSet.model_validate_json(resp.text or "{}").keywords:
            unique.setdefault(kw.name.strip().lower(), kw)
        result = list(unique.values())[:k]
        log.info("Extracted %d keywords (requested %d)", len(result), k)
        return result
    except Exception:
        log.exception("Failed to extract keywords, returning empty list")
        return []
