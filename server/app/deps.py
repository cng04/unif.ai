from functools import lru_cache

from unifai_agent import GeminiLLM, Interviewer, Jev, Judge, OpenRouterJev, jev_client

from app.config import get_settings


@lru_cache
def get_llm() -> GeminiLLM:
    settings = get_settings()
    return GeminiLLM(model=settings.gemini_model, api_key=settings.gemini_api_key or None)


@lru_cache
def get_jev() -> Jev:
    settings = get_settings()
    if settings.openrouter_api_key:
        return OpenRouterJev(settings.openrouter_api_key, settings.openrouter_model)
    return jev_client(settings.typesafe_api_key, settings.jev_model)


def get_interviewer() -> Interviewer:
    return Interviewer(get_llm())


def get_judge() -> Judge:
    return Judge(get_llm(), get_jev())
