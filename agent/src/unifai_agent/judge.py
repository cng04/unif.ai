import json
from typing import Literal

from pydantic import BaseModel, Field

from unifai_agent.conversation import Transcript
from unifai_agent.llm import LLM
from unifai_agent.profile import AgentProfile
from unifai_agent.prompts import GROUP_JUDGE_SYSTEM_PROMPT, JUDGE_SYSTEM_PROMPT


class Verdict(BaseModel):
    vibe_score: int = Field(ge=1, le=10)
    dealbreaker_conflicts: list[str] = Field(default_factory=list)
    logistics_fit: Literal["strong", "workable", "incompatible"]
    rationale: str

    @property
    def has_conflict(self) -> bool:
        return bool(self.dealbreaker_conflicts) or self.logistics_fit == "incompatible"

    @property
    def edge_weight(self) -> float:
        """Weight for the group-building graph; 0 means never group these two."""
        if self.has_conflict:
            return 0.0
        penalty = 1.0 if self.logistics_fit == "strong" else 0.7
        return self.vibe_score / 10 * penalty


class GroupVerdict(BaseModel):
    works: bool
    group_score: int = Field(ge=1, le=10)
    rationale: str
    remove_user_id: str | None = None


class Judge:
    def __init__(self, llm: LLM):
        self.llm = llm

    def evaluate(self, a: AgentProfile, b: AgentProfile, transcript: Transcript) -> Verdict:
        names = {a.user_id: a.public.name, b.user_id: b.public.name}
        prompt = "\n\n".join(
            [
                f"PROFILE A:\n{a.model_dump_json(indent=2)}",
                f"PROFILE B:\n{b.model_dump_json(indent=2)}",
                f"TRANSCRIPT:\n{transcript.render(names)}",
                f"PRIVATE NOTES:\n{json.dumps({names[k]: v for k, v in transcript.notes.items()}, indent=2)}",
            ]
        )
        resp = self.llm.generate(
            JUDGE_SYSTEM_PROMPT, [{"role": "user", "content": prompt}], temperature=0.2, response_model=Verdict
        )
        return Verdict.model_validate_json(resp.text or "{}")

    def evaluate_group(
        self, profiles: list[AgentProfile], pair_verdicts: dict[tuple[str, str], Verdict]
    ) -> GroupVerdict:
        prompt = "\n\n".join(
            [
                "MEMBERS:\n" + "\n".join(p.model_dump_json() for p in profiles),
                "PAIRWISE VERDICTS:\n"
                + "\n".join(f"{a} <> {b}: {v.model_dump_json()}" for (a, b), v in pair_verdicts.items()),
            ]
        )
        resp = self.llm.generate(
            GROUP_JUDGE_SYSTEM_PROMPT,
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            response_model=GroupVerdict,
        )
        return GroupVerdict.model_validate_json(resp.text or "{}")
