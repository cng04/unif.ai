import json

from unifai_agent.llm import LLM, Message
from unifai_agent.profile import AgentProfile, ProfileDraft
from unifai_agent.prompts import INTERVIEWER_SYSTEM_PROMPT, PROFILE_BUILDER_SYSTEM_PROMPT


class Interviewer:
    """Onboarding chat that discovers a user's interests and personality, then builds their agent profile."""

    def __init__(self, llm: LLM):
        self.llm = llm

    def reply(self, history: list[Message]) -> str:
        if not history:
            history = [{"role": "user", "content": "(The user just opened the onboarding chat. Greet them.)"}]
        resp = self.llm.generate(INTERVIEWER_SYSTEM_PROMPT, history, temperature=0.8)
        return resp.text or ""

    def build_profile(
        self,
        user_id: str,
        full_name: str,
        *,
        interview: list[Message],
        self_report: str | None = None,
        scraped: dict | None = None,
    ) -> AgentProfile:
        sources = "\n\n".join(
            [
                f"NAME: {full_name}",
                f"SCRAPED ACCOUNTS:\n{json.dumps(scraped or {}, indent=2)}",
                f"SELF-REPORT:\n{self_report or 'none'}",
                "INTERVIEW:\n" + "\n".join(f"{m['role']}: {m['content']}" for m in interview),
            ]
        )
        resp = self.llm.generate(
            PROFILE_BUILDER_SYSTEM_PROMPT,
            [{"role": "user", "content": sources}],
            temperature=0.2,
            response_model=ProfileDraft,
        )
        draft = ProfileDraft.model_validate_json(resp.text or "{}")
        return AgentProfile(user_id=user_id, **draft.model_dump())
