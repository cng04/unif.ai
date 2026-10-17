import os
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel

Message = dict[str, str]


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass
class LLMResponse:
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLM(Protocol):
    def generate(
        self,
        system: str,
        history: list[Message],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.7,
        response_model: type[BaseModel] | None = None,
    ) -> LLMResponse: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class GeminiLLM:
    def __init__(
        self,
        model: str = "gemini-3.8-flash",
        embedding_model: str = "gemini-embedding-001",
        api_key: str | None = None,
    ):
        from google import genai
        from google.genai import types

        # Free-tier quotas are per minute, so back off up to 60s between attempts.
        retry = types.HttpRetryOptions(
            attempts=8, initial_delay=2, max_delay=60, exp_base=2, http_status_codes=[429, 500, 502, 503, 504]
        )
        self.client = genai.Client(
            api_key=api_key or os.environ.get("GEMINI_API_KEY"),
            http_options=types.HttpOptions(retry_options=retry),
        )
        self.model = model
        self.embedding_model = embedding_model

    def generate(
        self,
        system: str,
        history: list[Message],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.7,
        response_model: type[BaseModel] | None = None,
    ) -> LLMResponse:
        from google.genai import types

        contents = [
            types.Content(
                role="model" if m["role"] == "assistant" else "user",
                parts=[types.Part(text=m["content"])],
            )
            for m in history
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            tools=[types.Tool(function_declarations=[types.FunctionDeclaration(**t) for t in tools])]
            if tools
            else None,
            response_mime_type="application/json" if response_model else None,
            response_schema=response_model,
        )
        resp = self.client.models.generate_content(model=self.model, contents=contents, config=config)
        calls = [ToolCall(c.name, dict(c.args or {})) for c in (resp.function_calls or [])]
        return LLMResponse(text=None if calls else resp.text, tool_calls=calls)

    def embed(self, texts: list[str]) -> list[list[float]]:
        from google.genai import types

        resp = self.client.models.embed_content(
            model=self.embedding_model,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
        return [e.values for e in resp.embeddings]
