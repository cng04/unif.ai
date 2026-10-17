import json
from typing import Literal

from pydantic import BaseModel, Field
from typesafe_sdk import Choice, Noul, Score

from unifai_agent.conversation import Transcript
from unifai_agent.jev import YES, Jev
from unifai_agent.llm import LLM
from unifai_agent.profile import AgentProfile
from unifai_agent.prompts import GROUP_JUDGE_SYSTEM_PROMPT

CHEMISTRY_LEVELS = [
    "No rapport: stilted, one-sided, or awkward",
    "Polite but flat: answers questions, little back-and-forth",
    "Friendly: some shared ground and an easy conversation",
    "Strong: they build on each other's ideas and humor",
    "Exceptional: obvious mutual enthusiasm, they make plans to meet",
]

LOGISTICS_OPTIONS = {
    "strong": "Same area, similar budget, and overlapping free time",
    "workable": "Some mismatch in area, budget, or free time, but meeting up is realistic",
    "incompatible": "Meeting up regularly is unrealistic because of area, budget, or free time",
}


class Verdict(BaseModel):
    vibe_score: float = Field(ge=1, le=10)
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
    """Pair verdicts come from Jev (calibrated typed answers); group verdicts come from the generative LLM."""

    def __init__(self, llm: LLM, jev: Jev):
        self.llm = llm
        self.jev = jev

    def evaluate(self, a: AgentProfile, b: AgentProfile, transcript: Transcript) -> Verdict:
        names = {a.user_id: a.public.name, b.user_id: b.public.name}
        state = {
            "person_a": a.model_dump(exclude={"user_id", "temperature"}),
            "person_b": b.model_dump(exclude={"user_id", "temperature"}),
            "transcript": transcript.render(names),
            "private_notes": {names[k]: v for k, v in transcript.notes.items()},
        }
        questions = {
            "chemistry": Score(
                instructions="In `transcript`, how much natural chemistry do person_a and person_b show?",
                criteria=CHEMISTRY_LEVELS,
            ),
            "logistics": Choice(
                instructions="Using `person_a.private.logistics` and `person_b.private.logistics`, "
                "how realistic is it for them to meet up in person?",
                criteria=LOGISTICS_OPTIONS,
            ),
        }
        dealbreakers = [("a", "person_b", d) for d in a.private.dealbreakers]
        dealbreakers += [("b", "person_a", d) for d in b.private.dealbreakers]
        for i, (_, other, d) in enumerate(dealbreakers):
            questions[f"dealbreaker_{i}"] = Noul(
                instructions=f"Based on `{other}` and `transcript`, does {other} clearly have this trait "
                f"or habit: {d}?"
            )

        result = self.jev.system_one(state, questions)
        chemistry = result.scores["chemistry"]
        vibe = 1 + 9 * chemistry.score / (len(CHEMISTRY_LEVELS) - 1)
        fit = result.choices["logistics"].choice
        owner = {"a": a.public.name, "b": b.public.name}
        conflicts = [
            f"{owner[who]}: {d}"
            for i, (who, _, d) in enumerate(dealbreakers)
            if result.nouls[f"dealbreaker_{i}"].noul > YES
        ]
        rationale = (
            f"Chemistry {vibe:.1f}/10 (confidence {chemistry.confidence:.2f}); logistics {fit}; "
            f"dealbreakers: {', '.join(conflicts) or 'none'}."
        )
        return Verdict(vibe_score=vibe, dealbreaker_conflicts=conflicts, logistics_fit=fit, rationale=rationale)

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
