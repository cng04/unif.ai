"""Choose sprite parts that look like a person, from what they said about themselves (never a guess from a name)."""

import json

from pydantic import BaseModel

from unifai_agent.llm import LLM
from unifai_agent.profile import LOOK_MAX, Look
from unifai_agent.prompts import LOOK_SYSTEM_PROMPT


class LookPick(BaseModel):
    """What the model fills in: the `Look` parts, without the source."""

    skin: int | None = None
    hair: int | None = None
    hair_style: int | None = None
    shirt_hue: int | None = None
    pants: int | None = None


def clean_look(raw: object, source: str = "agent") -> Look:
    """Keep only whole numbers inside each part's range. Anything else becomes unset, so a confused or
    manipulated model answer can never produce an invalid sprite."""
    data = raw if isinstance(raw, dict) else {}
    parts: dict[str, int | None] = {}
    for key, top in LOOK_MAX.items():
        value = data.get(key)
        ok = isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= top
        parts[key] = value if ok else None
    return Look(**parts, source=source)  # type: ignore[arg-type]


def choose_look(llm: LLM, statements: str) -> Look:
    """`statements` is what the person wrote about themselves (interview answers, intro). No statement about
    appearance gives an empty look, and the sprite keeps its defaults."""
    if not statements.strip():
        return Look()
    resp = llm.generate(
        LOOK_SYSTEM_PROMPT,
        [{"role": "user", "content": f"WHAT THE PERSON WROTE:\n{statements}"}],
        temperature=0.0,
        response_model=LookPick,
    )
    try:
        return clean_look(json.loads(resp.text or "{}"))
    except ValueError:
        return Look()
