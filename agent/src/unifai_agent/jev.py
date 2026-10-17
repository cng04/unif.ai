"""TypeSafe's Jev: a discriminative model that answers typed questions about a state with calibrated
probabilities. It can't generate text, so chats, keywords, and the group judge stay on the generative LLM."""

from collections.abc import Mapping
from typing import Any, Protocol

YES = 0.5  # a Noul above this is "more likely true than not"


class Jev(Protocol):
    """The slice of `typesafe_sdk.TypeSafeClient` we use, so tests can pass a fake."""

    def system_one(self, state: Any, questions: Mapping[str, Any]) -> Any: ...


def jev_client(api_key: str | None = None, model: str = "jev-latest") -> Jev:
    from typesafe_sdk import TypeSafeClient

    return TypeSafeClient(api_key=api_key or None, model=model)
