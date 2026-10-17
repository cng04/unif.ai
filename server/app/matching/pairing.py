"""Step 3: two persona agents talk, then the judge scores the pair."""

from unifai_agent import AgentProfile, Judge, LLM, PersonaAgent, Transcript, Verdict, run_conversation


def simulate_pair(
    llm: LLM, judge: Judge, a: AgentProfile, b: AgentProfile, max_turns: int
) -> tuple[Transcript, Verdict]:
    transcript = run_conversation(PersonaAgent(a, llm), PersonaAgent(b, llm), max_turns=max_turns)
    return transcript, judge.evaluate(a, b, transcript)
