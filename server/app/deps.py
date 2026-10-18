import logging
from functools import lru_cache

from unifai_agent import LLM, GeminiLLM, Interviewer, Jev, Judge, OpenRouterJev, OpenRouterLLM, jev_client

from app.config import get_settings

log = logging.getLogger(__name__)
DEFAULT_OPENROUTER_JEV_MODEL = "~typesafe/jev-latest"


def _models(csv: str) -> list[str]:
    return [m.strip() for m in csv.split(",") if m.strip()]


def _jev_models(csv: str) -> list[str]:
    configured = _models(csv)
    models = [m for m in configured if m.lstrip("~").startswith("typesafe/jev-")]
    ignored = [m for m in configured if m not in models]
    if ignored:
        log.warning("Ignoring non-Jev OPENROUTER_JEV_MODEL entries: %s", ", ".join(ignored))
    return models or [DEFAULT_OPENROUTER_JEV_MODEL]


@lru_cache
def get_llm() -> LLM:
    settings = get_settings()
    if settings.openrouter_api_key:
        return OpenRouterLLM(settings.openrouter_model, settings.openrouter_api_key, rpm=settings.openrouter_rpm)
    return GeminiLLM(model=settings.gemini_model, api_key=settings.gemini_api_key or None)


@lru_cache
def get_chat_llms() -> list[LLM]:
    """Persona-chat LLMs. Pairs rotate through them, so each model's own rate limit adds throughput."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return [get_llm()]
    models = _models(settings.openrouter_chat_model)
    return [
        OpenRouterLLM(
            m,
            settings.openrouter_api_key,
            max_tokens=settings.openrouter_chat_max_tokens,
            rpm=settings.openrouter_rpm,
        )
        for m in models
    ]


@lru_cache
def get_jevs() -> list[Jev]:
    """Scoring and pair-judge models, rotated the same way as the chat models."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return [jev_client(settings.typesafe_api_key, settings.jev_model)]
    models = _jev_models(settings.openrouter_jev_model)
    return [
        OpenRouterJev(
            settings.openrouter_api_key,
            m,
            rpm=settings.openrouter_rpm,
        )
        for m in models
    ]


def get_interviewer() -> Interviewer:
    return Interviewer(get_llm())


def get_judges() -> list[Judge]:
    return [Judge(get_llm(), jev) for jev in get_jevs()]
