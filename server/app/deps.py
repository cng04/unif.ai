from functools import lru_cache

from unifai_agent import GeminiLLM, Interviewer, Jev, Judge, jev_client

from app.config import get_settings


@lru_cache
def get_llm() -> GeminiLLM:
    return GeminiLLM(api_key=get_settings().gemini_api_key or None)


@lru_cache
def get_jev() -> Jev:
    settings = get_settings()
    return jev_client(settings.typesafe_api_key, settings.jev_model)


def get_interviewer() -> Interviewer:
    return Interviewer(get_llm())


def get_judge() -> Judge:
    return Judge(get_llm(), get_jev())
