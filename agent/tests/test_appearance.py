import json

from unifai_agent.appearance import choose_look, clean_look
from unifai_agent.llm import LLMResponse
from unifai_agent.profile import LOOK_MAX


class FakeLLM:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def generate(self, system, history, **kwargs):
        self.calls.append((system, history, kwargs))
        text = self.answer if isinstance(self.answer, str) else json.dumps(self.answer)
        return LLMResponse(text=text)


def test_stated_details_become_parts_and_the_rest_stays_unset():
    llm = FakeLLM({"hair": 5, "hair_style": 2, "shirt_hue": 120, "skin": None, "pants": None})
    look = choose_look(llm, "I have red hair in a bun and usually wear green.")
    assert (look.hair, look.hair_style, look.shirt_hue) == (5, 2, 120)
    assert look.skin is None and look.pants is None and look.source == "agent"
    system, history, kwargs = llm.calls[0]
    assert "never infer" in system.lower() or "Never infer" in system
    assert "red hair" in history[0]["content"] and kwargs["response_model"].__name__ == "LookPick"


def test_out_of_range_or_wrong_type_values_are_dropped():
    look = clean_look({"skin": 9, "hair": -1, "hair_style": "long", "shirt_hue": 360, "pants": True})
    assert all(getattr(look, k) is None for k in LOOK_MAX)
    edge = clean_look({k: v for k, v in LOOK_MAX.items()})
    assert all(getattr(edge, k) == v for k, v in LOOK_MAX.items())


def test_nothing_written_means_no_model_call():
    llm = FakeLLM({"skin": 3})
    look = choose_look(llm, "   ")
    assert llm.calls == [] and all(getattr(look, k) is None for k in LOOK_MAX)


def test_unparseable_answer_gives_an_empty_look():
    look = choose_look(FakeLLM("not json"), "I wear blue")
    assert all(getattr(look, k) is None for k in LOOK_MAX)
