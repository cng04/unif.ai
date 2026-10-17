import json

import httpx
import pytest
from typesafe_sdk import Choice, Noul, Score

from unifai_agent import OpenRouterJev

QUESTIONS = {
    "chemistry": Score(instructions="How much chemistry?", criteria=["none", "some", "lots"]),
    "dealbreaker_0": Noul(instructions="Does person_b smoke?"),
    "logistics": Choice(instructions="Can they meet?", criteria={"strong": "easy", "incompatible": "no"}),
}


def jev_answering(content: dict) -> tuple[OpenRouterJev, list]:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    jev = OpenRouterJev(api_key="test")
    jev.client = httpx.Client(transport=httpx.MockTransport(handler))
    return jev, requests


def test_system_one_maps_json_answers_to_typed_results():
    jev, requests = jev_answering(
        {"chemistry": {"level": 7, "confidence": 0.8}, "dealbreaker_0": 1.4, "logistics": "strong"}
    )

    result = jev.system_one({"transcript": "hi"}, QUESTIONS)

    assert (result.scores["chemistry"].score, result.scores["chemistry"].confidence) == (2, 0.8)
    assert result.nouls["dealbreaker_0"].noul == 1.0
    assert result.choices["logistics"].choice == "strong"
    schema = requests[0]["response_format"]["json_schema"]["schema"]
    assert schema["required"] == list(QUESTIONS)
    assert schema["properties"]["logistics"]["enum"] == ["strong", "incompatible"]
    assert "2: lots" in requests[0]["messages"][1]["content"]


def test_system_one_rejects_skipped_questions_and_unknown_choices():
    jev, _ = jev_answering({"chemistry": {"level": 1, "confidence": 0.5}, "dealbreaker_0": 0.1, "logistics": "meh"})
    with pytest.raises(ValueError, match="logistics"):
        jev.system_one("doc", QUESTIONS)

    jev, _ = jev_answering({"chemistry": {"level": 1, "confidence": 0.5}})
    with pytest.raises(ValueError, match="dealbreaker_0"):
        jev.system_one("doc", QUESTIONS)
