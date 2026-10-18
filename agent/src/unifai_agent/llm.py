import json
import os
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel

from unifai_agent.openrouter import limiter_for, make_client, post_chat

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
        require_tool: bool = False,
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
        require_tool: bool = False,
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
            tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="ANY"))
            if tools and require_tool
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


def _json_schema(schema: Any) -> Any:
    """Gemini tool declarations use OpenAPI's uppercase types ("OBJECT"); OpenRouter wants JSON Schema."""
    if isinstance(schema, dict):
        return {k: v.lower() if k == "type" and isinstance(v, str) else _json_schema(v) for k, v in schema.items()}
    if isinstance(schema, list):
        return [_json_schema(v) for v in schema]
    return schema


class OpenRouterLLM:
    def __init__(
        self,
        model: str = "google/gemini-2.5-flash-lite",
        api_key: str | None = None,
        max_tokens: int = 4096,
        attempts: int = 8,
        timeout: float = 180.0,
        rpm: int = 0,
    ):
        self.client = make_client(api_key, timeout)
        self.model = model
        # OpenRouter reserves credit for max_tokens on every in-flight request, so keep it bounded.
        self.max_tokens = max_tokens
        self.attempts = attempts
        self.limiter = limiter_for(model, rpm)

    def generate(
        self,
        system: str,
        history: list[Message],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.7,
        response_model: type[BaseModel] | None = None,
        require_tool: bool = False,
    ) -> LLMResponse:
        body: dict[str, Any] = {
            "model": self.model,
            "temperature": temperature,
            "max_tokens": self.max_tokens,
            "reasoning": {"effort": "low", "exclude": True},
            "messages": [{"role": "system", "content": system}, *history],
        }
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": _json_schema(t.get("parameters", {"type": "object", "properties": {}})),
                    },
                }
                for t in tools
            ]
            if require_tool:
                body["tool_choice"] = "required"
        if response_model:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": response_model.__name__, "schema": response_model.model_json_schema()},
            }

        for attempt in range(3):
            message = post_chat(self.client, body, self.attempts, self.limiter)["choices"][0]["message"]
            calls = [
                ToolCall(c["function"]["name"], json.loads(c["function"].get("arguments") or "{}"))
                for c in message.get("tool_calls") or []
            ]
            text = None if calls else message.get("content")
            if not response_model or text:
                return LLMResponse(text=text, tool_calls=calls)
        return LLMResponse(text=text, tool_calls=calls)

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("OpenRouterLLM has no embeddings; use GeminiLLM.embed")
