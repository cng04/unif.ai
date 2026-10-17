import json
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
    def __init__(self, profile: AgentProfile, llm: LLM, max_steps: int = 4):
        self.profile = profile
        self.llm = llm
        self.max_steps = max_steps
        self.system = persona_system_prompt(profile)
        self.history: list[Message] = []
        self.notes: list[str] = []

    @property
    def user_id(self) -> str:
        return self.profile.user_id

    def respond(self) -> TurnResult:
        """Run tool calls until the agent sends a message or ends the conversation."""
        scratch = list(self.history) or [{"role": "user", "content": CONVERSATION_KICKOFF}]

        for _ in range(self.max_steps):
            resp = self.llm.generate(
                self.system, scratch, tools=TOOL_DECLARATIONS, temperature=self.profile.temperature
            )
            if not resp.tool_calls:
                scratch.append({"role": "assistant", "content": resp.text or ""})
                scratch.append({"role": "user", "content": "(Use send_message to talk to the other agent.)"})
                continue

            message: str | None = None
            tool_results: list[str] = []
            for call in resp.tool_calls:
                match call.name:
                    case "send_message":
                        message = call.args.get("text", "")
                        if note := call.args.get("note"):
                            self.notes.append(note)
                    case "end_conversation":
                        return TurnResult(message, ended=True, end_reason=call.args.get("reason"))
                    case "check_availability":
                        tool_results.append(f"availability: {self.profile.private.logistics.model_dump_json()}")
                    case "lookup_profile":
                        field = call.args.get("field", "")
                        tool_results.append(f"{field}: {self._lookup(field)}")
                    case "ask_my_human":
                        tool_results.append("ask_my_human: your human isn't available right now.")

            if message is not None:
                return TurnResult(message)
            scratch.append({"role": "user", "content": "(tool results)\n" + "\n".join(tool_results)})

        return TurnResult(None, ended=True, end_reason="max_steps")

    def _lookup(self, field: str) -> str:
        for section in (self.profile.public, self.profile.private):
            if field in type(section).model_fields:
                return json.dumps(getattr(section, field), default=lambda o: o.model_dump())
        return "unknown"
