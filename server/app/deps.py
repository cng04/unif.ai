from functools import lru_cache

from unifai_agent import GeminiLLM, Interviewer, Judge

from app.config import get_settings


@lru_cache
def get_llm() -> GeminiLLM:
    return GeminiLLM(api_key=get_settings().gemini_api_key or None)


def get_interviewer() -> Interviewer:
    return Interviewer(get_llm())


def get_judge() -> Judge:
    return Judge(get_llm())
