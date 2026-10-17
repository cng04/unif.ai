"""Step 3: two persona agents talk, then the judge scores the pair."""

import logging

from unifai_agent import AgentProfile, Judge, LLM, PersonaAgent, Transcript, Verdict, run_conversation

log = logging.getLogger(__name__)


def simulate_pair(
    llm: LLM, judge: Judge, a: AgentProfile, b: AgentProfile, max_turns: int
) -> tuple[Transcript, Verdict]:
    try:
        transcript = run_conversation(PersonaAgent(a, llm), PersonaAgent(b, llm), max_turns=max_turns)
        verdict = judge.evaluate(a, b, transcript)
        return transcript, verdict
    except Exception:
        log.exception("Failed to simulate pair between %s and %s", a.user_id, b.user_id)
        raise
