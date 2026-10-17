"""TypeSafe's Jev: a discriminative model that answers typed questions about a state with calibrated
probabilities. It can't generate text, so chats, keywords, and the group judge stay on the generative LLM.

`OpenRouterJev` answers the same `Score` / `Noul` / `Choice` questions with a generative model on OpenRouter.
Its probabilities are the model's own estimates, so they are not calibrated like Jev's."""

import json
import os
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from unifai_agent.prompts import TYPED_QUESTIONS_SYSTEM_PROMPT

YES = 0.5  # a Noul above this is "more likely true than not"


class Jev(Protocol):
    """The slice of `typesafe_sdk.TypeSafeClient` we use, so tests can pass a fake."""

    def system_one(self, state: Any, questions: Mapping[str, Any]) -> Any: ...


def jev_client(api_key: str | None = None, model: str = "jev-latest") -> Jev:
    from typesafe_sdk import TypeSafeClient

    return TypeSafeClient(api_key=api_key or None, model=model)


@dataclass
class ScoreAnswer:
    score: int
    confidence: float


@dataclass
class NoulAnswer:
    noul: float


@dataclass
class ChoiceAnswer:
    choice: str


@dataclass
class Answers:
    scores: dict[str, ScoreAnswer] = field(default_factory=dict)
    nouls: dict[str, NoulAnswer] = field(default_factory=dict)
    choices: dict[str, ChoiceAnswer] = field(default_factory=dict)


def _text(content: Any) -> str:
    return content if isinstance(content, str) else json.dumps(content, default=str)


def _render(state: Any, questions: Mapping[str, Any]) -> str:
    lines = ["MATERIAL:", _text(state) if isinstance(state, str) else json.dumps(state, indent=2, default=str), ""]
    lines.append("QUESTIONS:")
    for name, q in questions.items():
        lines.append(f"\n[{name}] ({q.type}) {_text(q.instructions or '')}")
        if q.type == "score":
            lines += [f"  {i}: {_text(c)}" for i, c in enumerate(q.criteria)]
        elif q.type == "choice":
            lines += [f"  {label}: {_text(c or '')}" for label, c in q.criteria.items()]
        elif q.criteria:
            lines += [f"  {outcome}: {_text(c)}" for outcome, c in q.criteria.items() if c is not None]
    return "\n".join(lines)


def _schema(questions: Mapping[str, Any]) -> dict:
    props: dict[str, Any] = {}
    for name, q in questions.items():
        if q.type == "score":
            props[name] = {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": f"0 to {len(q.criteria) - 1}"},
                    "confidence": {"type": "number", "description": "0 to 1"},
                },
                "required": ["level", "confidence"],
                "additionalProperties": False,
            }
        elif q.type == "noul":
            props[name] = {"type": "number", "description": "probability of yes, 0 to 1"}
        elif q.type == "choice":
            props[name] = {"type": "string", "enum": list(q.criteria)}
        else:
            raise ValueError(f"OpenRouterJev can't answer {q.type!r} questions")
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _parse(raw: Mapping[str, Any], questions: Mapping[str, Any]) -> Answers:
    def clamp(x: Any) -> float:
        return min(max(float(x), 0.0), 1.0)

    out = Answers()
    for name, q in questions.items():
        if name not in raw:
            raise ValueError(f"model skipped question {name!r}")
        value = raw[name]
        if q.type == "score":
            level = min(max(int(round(float(value["level"]))), 0), len(q.criteria) - 1)
            out.scores[name] = ScoreAnswer(score=level, confidence=clamp(value["confidence"]))
        elif q.type == "noul":
            out.nouls[name] = NoulAnswer(noul=clamp(value))
        else:
            if value not in q.criteria:
                raise ValueError(f"{name!r}: {value!r} is not one of {list(q.criteria)}")
            out.choices[name] = ChoiceAnswer(choice=value)
    return out


class OpenRouterJev:
    URL = "https://openrouter.ai/api/v1/chat/completions"
    RETRY_STATUS = {408, 429, 500, 502, 503, 504}

    def __init__(
        self, api_key: str | None = None, model: str = "google/gemini-3.8-flash", attempts: int = 6, timeout=180.0
    ):
        import httpx

        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise ValueError("No OpenRouter API key: pass api_key or set OPENROUTER_API_KEY")
        self.client = httpx.Client(headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
        self.model = model
        self.attempts = attempts

    def system_one(self, state: Any, questions: Mapping[str, Any]) -> Answers:
        body = {
            "model": self.model,
            "temperature": 0,
            # Without a cap OpenRouter reserves credit for the model's full output window.
            "max_tokens": 1024 + 50 * len(questions),
            "reasoning": {"effort": "low", "exclude": True},
            "messages": [
                {"role": "system", "content": TYPED_QUESTIONS_SYSTEM_PROMPT},
                {"role": "user", "content": _render(state, questions)},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "answers", "strict": True, "schema": _schema(questions)},
            },
        }
        data = self._post(body)
        return _parse(json.loads(data["choices"][0]["message"]["content"]), questions)

    def _post(self, body: dict) -> dict:
        import httpx

        for attempt in range(self.attempts):
            last = attempt == self.attempts - 1
            try:
                resp = self.client.post(self.URL, json=body)
            except httpx.TransportError:
                if last:
                    raise
            else:
                if resp.status_code not in self.RETRY_STATUS or last:
                    data = resp.json() if resp.content else {}
                    if resp.is_error or "error" in data:
                        raise RuntimeError(f"OpenRouter {resp.status_code}: {data.get('error') or resp.text[:500]}")
                    return data
            time.sleep(min(2 * 2**attempt, 60))
        raise AssertionError("unreachable")
