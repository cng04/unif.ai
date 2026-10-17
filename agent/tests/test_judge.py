from types import SimpleNamespace

from unifai_agent import AgentProfile, Judge, Transcript


class FakeJev:
    """Answers each question by name: Score -> level index, Noul -> probability, Choice -> option."""

    def __init__(self, answers: dict):
        self.answers = answers
        self.questions: dict = {}

    def system_one(self, state, questions):
        self.questions = questions
        out = {"score": {}, "noul": {}, "choice": {}}
        for name, q in questions.items():
            value = self.answers.get(name, 0.0)
            if q.type == "score":
                out["score"][name] = SimpleNamespace(score=value, confidence=0.8)
            elif q.type == "noul":
                out["noul"][name] = SimpleNamespace(noul=value)
            else:
                out["choice"][name] = SimpleNamespace(choice=value)
        return SimpleNamespace(scores=out["score"], nouls=out["noul"], choices=out["choice"])


def person(user_id: str, name: str, dealbreakers: list[str]) -> AgentProfile:
    return AgentProfile.model_validate(
        {"user_id": user_id, "public": {"name": name}, "private": {"dealbreakers": dealbreakers}}
    )


def test_evaluate_maps_jev_answers_to_a_verdict():
    a = person("a", "Cynthia", ["heavy drinking culture", "flaky plans"])
    b = person("b", "Marco", ["people who cancel for being tired"])
    jev = FakeJev({"chemistry": 3, "logistics": "workable", "dealbreaker_0": 0.9, "dealbreaker_2": 0.2})

    verdict = Judge(llm=None, jev=jev).evaluate(a, b, Transcript(messages=[("a", "hi"), ("b", "hey")]))

    assert verdict.vibe_score == 1 + 9 * 3 / 4
    assert verdict.logistics_fit == "workable"
    assert verdict.dealbreaker_conflicts == ["Cynthia: heavy drinking culture"]
    assert verdict.has_conflict and verdict.edge_weight == 0
    assert set(jev.questions) == {"chemistry", "logistics", "dealbreaker_0", "dealbreaker_1", "dealbreaker_2"}


def test_evaluate_without_dealbreakers_gives_positive_edge():
    jev = FakeJev({"chemistry": 4, "logistics": "strong"})

    verdict = Judge(llm=None, jev=jev).evaluate(person("a", "A", []), person("b", "B", []), Transcript())

    assert verdict.vibe_score == 10
    assert verdict.edge_weight == 1.0
