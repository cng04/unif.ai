"""Step 3: two persona agents talk, then the judge scores the pair."""

import logging
import random

from unifai_agent import AgentProfile, Judge, LLM, PersonaAgent, Transcript, Verdict, run_conversation

log = logging.getLogger(__name__)


def _temperature_for_chat(llm: LLM) -> float | None:
    base = getattr(llm, "chat_temperature", None)
    if base is None:
        return None
    jitter = max(0.0, float(getattr(llm, "temperature_jitter", 0.0)))
    return min(max(float(base) + random.uniform(-jitter, jitter), 0.0), 2.0)


def simulate_pair(
    llm: LLM, judge: Judge, a: AgentProfile, b: AgentProfile, max_turns: int
) -> tuple[Transcript, Verdict]:
    try:
        temperature = _temperature_for_chat(llm)
        log.info(
            "Starting pair %s/%s using %s at temperature %s",
            a.user_id,
            b.user_id,
            getattr(llm, "model", type(llm).__name__),
            f"{temperature:.2f}" if temperature is not None else "profile",
        )
        transcript = run_conversation(
            PersonaAgent(a, llm, temperature_override=temperature),
            PersonaAgent(b, llm, temperature_override=temperature),
            max_turns=max_turns,
        )
        verdict = judge.evaluate(a, b, transcript)
        return transcript, verdict
    except Exception:
        log.exception("Failed to simulate pair between %s and %s", a.user_id, b.user_id)
        raise
