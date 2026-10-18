from typesafe_sdk import Choice, Noul, Score

from unifai_agent import OpenRouterJev

QUESTIONS = {
    "chemistry": Score(instructions="How much chemistry?", criteria=["none", "some", "lots"]),
    "dealbreaker_0": Noul(instructions="Does person_b smoke?"),
    "logistics": Choice(instructions="Can they meet?", criteria={"strong": "easy", "incompatible": "no"}),
}


def test_openrouter_jev_uses_native_system_one_api(monkeypatch):
    created = []
    calls = []
    expected = object()

    class FakeTypeSafeClient:
        def __init__(self, **kwargs):
            created.append(kwargs)

        def system_one(self, state, questions, **kwargs):
            calls.append((state, questions, kwargs))
            return expected

    monkeypatch.setattr("typesafe_sdk.TypeSafeClient", FakeTypeSafeClient)

    jev = OpenRouterJev(api_key="or-test", model="typesafe/jev-1.14", timeout=12.0)
    result = jev.system_one({"transcript": "hi"}, QUESTIONS)

    assert created == [
        {
            "api_key": "or-test",
            "model": "typesafe/jev-1.14",
            "base_url": "https://openrouter.ai/api",
        }
    ]
    assert calls == [({"transcript": "hi"}, QUESTIONS, {"timeout": 12.0})]
    assert result is expected


def test_openrouter_jev_reads_openrouter_key_from_environment(monkeypatch):
    created = []

    class FakeTypeSafeClient:
        def __init__(self, **kwargs):
            created.append(kwargs)

    monkeypatch.setattr("typesafe_sdk.TypeSafeClient", FakeTypeSafeClient)
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-env-test")

    OpenRouterJev()

    assert created[0]["api_key"] == "or-env-test"
