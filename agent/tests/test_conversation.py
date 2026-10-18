from unifai_agent import AgentProfile, PersonaAgent, PublicProfile, run_conversation
from unifai_agent.llm import LLMResponse, ToolCall


class ScriptedLLM:
    """Returns queued responses in order, ignoring the prompt."""

    def __init__(self, responses: list[LLMResponse]):
        self.responses = list(responses)
        self.calls = []

    def generate(self, system, history, **kwargs) -> LLMResponse:
        self.calls.append(kwargs)
        return self.responses.pop(0)

    def embed(self, texts):
        return [[0.0] for _ in texts]


def profile(user_id: str, name: str) -> AgentProfile:
    return AgentProfile(user_id=user_id, public=PublicProfile(name=name))


def say(text: str) -> LLMResponse:
    return LLMResponse(tool_calls=[ToolCall("send_message", {"text": text})])


def test_agents_alternate_and_keep_notes_private():
    a = PersonaAgent(
        profile("a", "Cynthia"),
        ScriptedLLM([
            LLMResponse(tool_calls=[ToolCall("send_message", {"text": "hi", "note": "opening"})]),
            say("weekends are best"),
        ]),
    )
    b = PersonaAgent(
        profile("b", "Sam"),
        ScriptedLLM([say("hey, I climb too"), say("same here")]),
    )

    transcript = run_conversation(a, b, max_turns=4)

    assert transcript.messages == [
        ("a", "hi"),
        ("b", "hey, I climb too"),
        ("a", "weekends are best"),
        ("b", "same here"),
    ]
    assert transcript.end_reason == "max_turns"
    assert transcript.notes == {"a": ["opening"], "b": []}
    assert b.history[-1] == {"role": "assistant", "content": "same here"}


def test_plain_text_reply_is_nudged_back_to_send_message():
    llm = ScriptedLLM([LLMResponse(text="thinking out loud"), say("I'm Cynthia")])
    agent = PersonaAgent(profile("a", "Cynthia"), llm)

    result = agent.respond()

    assert result.message == "I'm Cynthia"
    assert not result.ended
    assert agent.history == []


def test_chat_temperature_override_replaces_profile_temperature():
    llm = ScriptedLLM([say("hi")])
    agent = PersonaAgent(profile("a", "Cynthia"), llm, temperature_override=1.03)

    agent.respond()

    assert llm.calls[0]["temperature"] == 1.03
