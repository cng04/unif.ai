"""TypeSafe's Jev: a discriminative model that answers typed questions about a state with calibrated
probabilities. It can't generate text, so chats, keywords, and the group judge stay on the generative LLM."""

import os
from collections.abc import Mapping
from typing import Any, Protocol

from unifai_agent.openrouter import limiter_for

YES = 0.5  # a Noul above this is "more likely true than not"
OPENROUTER_BASE_URL = "https://openrouter.ai/api"


class Jev(Protocol):
    """The slice of `typesafe_sdk.TypeSafeClient` we use, so tests can pass a fake."""

    def system_one(self, state: Any, questions: Mapping[str, Any]) -> Any: ...


def jev_client(api_key: str | None = None, model: str = "jev-latest", base_url: str | None = None) -> Jev:
    from typesafe_sdk import TypeSafeClient

    return TypeSafeClient(api_key=api_key or None, model=model, base_url=base_url)


class OpenRouterJev:
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "~typesafe/jev-latest",
        timeout=180.0,
        rpm: int = 0,
    ):
        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise ValueError("No OpenRouter API key: pass api_key or set OPENROUTER_API_KEY")
        self.client = jev_client(key, model, OPENROUTER_BASE_URL)
        self.model = model
        self.timeout = timeout
        self.limiter = limiter_for(model, rpm)

    def system_one(self, state: Any, questions: Mapping[str, Any]) -> Any:
        self.limiter.wait()
        return self.client.system_one(state, questions, timeout=self.timeout)
