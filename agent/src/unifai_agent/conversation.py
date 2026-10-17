from dataclasses import dataclass, field

from unifai_agent.persona import PersonaAgent


@dataclass
class Transcript:
    messages: list[tuple[str, str]] = field(default_factory=list)  # (speaker user_id, text)
    notes: dict[str, list[str]] = field(default_factory=dict)
    end_reason: str = "max_turns"

    def render(self, names: dict[str, str]) -> str:
        return "\n".join(f"{names.get(uid, uid)}: {text}" for uid, text in self.messages)


def run_conversation(a: PersonaAgent, b: PersonaAgent, max_turns: int = 12) -> Transcript:
    agents = [a, b]
    transcript = Transcript()

    for turn in range(max_turns):
        speaker, listener = agents[turn % 2], agents[(turn + 1) % 2]
        result = speaker.respond()

        if result.message:
            transcript.messages.append((speaker.user_id, result.message))
            speaker.history.append({"role": "assistant", "content": result.message})
            listener.history.append({"role": "user", "content": result.message})

        if result.ended:
            transcript.end_reason = result.end_reason or "ended"
            break

    transcript.notes = {agent.user_id: list(agent.notes) for agent in agents}
    return transcript
