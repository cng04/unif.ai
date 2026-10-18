from dataclasses import dataclass

from unifai_agent.llm import LLM, Message
from unifai_agent.profile import AgentProfile
from unifai_agent.prompts import CONVERSATION_KICKOFF, persona_system_prompt
from unifai_agent.tools import TOOL_DECLARATIONS


@dataclass
class TurnResult:
    message: str | None
    ended: bool = False
    end_reason: str | None = None


class PersonaAgent:
    def __init__(
        self,
        profile: AgentProfile,
        llm: LLM,
        max_steps: int = 3,
        temperature_override: float | None = None,
    ):
        self.profile = profile
        self.llm = llm
        self.max_steps = max_steps
        self.temperature_override = temperature_override
        self.system = persona_system_prompt(profile)
        self.history: list[Message] = []
        self.notes: list[str] = []

    @property
    def user_id(self) -> str:
        return self.profile.user_id

    def respond(self) -> TurnResult:
        """One model call per turn; retries only if the model ignores the required tool call."""
        scratch = list(self.history) or [{"role": "user", "content": CONVERSATION_KICKOFF}]

        for _ in range(self.max_steps):
            resp = self.llm.generate(
                self.system,
                scratch,
                tools=TOOL_DECLARATIONS,
                temperature=(
                    self.temperature_override if self.temperature_override is not None else self.profile.temperature
                ),
                require_tool=True,
            )
            message: str | None = None
            for call in resp.tool_calls:
                match call.name:
                    case "send_message":
                        message = call.args.get("text", "")
                        if note := call.args.get("note"):
                            self.notes.append(note)

            if message is not None:
                return TurnResult(message)
            scratch.append({"role": "assistant", "content": resp.text or ""})
            scratch.append({"role": "user", "content": "(Use send_message to talk to the other agent.)"})

        return TurnResult(None, ended=True, end_reason="max_steps")
