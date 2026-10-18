import json

import httpx
from pydantic import BaseModel

from unifai_agent import OpenRouterLLM
from unifai_agent.tools import TOOL_DECLARATIONS


def llm_returning(message: dict) -> tuple[OpenRouterLLM, list]:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": message}]})

    llm = OpenRouterLLM(api_key="test")
    llm.client = httpx.Client(transport=httpx.MockTransport(handler))
    return llm, requests


def test_tool_calls_are_parsed_and_declarations_converted_to_json_schema():
    llm, requests = llm_returning(
        {
            "content": "ignored",
            "tool_calls": [{"function": {"name": "send_message", "arguments": json.dumps({"text": "hi"})}}],
        }
    )

    resp = llm.generate("sys", [{"role": "user", "content": "hello"}], tools=TOOL_DECLARATIONS)

    assert resp.text is None
    assert [(c.name, c.args) for c in resp.tool_calls] == [("send_message", {"text": "hi"})]
    body = requests[0]
    assert body["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}]
    send = next(t["function"] for t in body["tools"] if t["function"]["name"] == "send_message")
    assert send["parameters"]["type"] == "object"
    assert send["parameters"]["properties"]["text"]["type"] == "string"
    assert "tool_choice" not in body


def test_require_tool_forces_a_tool_call():
    llm, requests = llm_returning(
        {"tool_calls": [{"function": {"name": "send_message", "arguments": json.dumps({"text": "hi"})}}]}
    )

    llm.generate("sys", [{"role": "user", "content": "hello"}], tools=TOOL_DECLARATIONS, require_tool=True)

    assert requests[0]["tool_choice"] == "required"


def test_generate_uses_requested_temperature():
    llm, requests = llm_returning({"content": "hi"})

    llm.generate("sys", [{"role": "user", "content": "hello"}], temperature=0.35)

    assert requests[0]["temperature"] == 0.35


def test_response_model_requests_json_schema_and_returns_text():
    class Answer(BaseModel):
        value: int

    llm, requests = llm_returning({"content": '{"value": 3}'})

    resp = llm.generate("sys", [{"role": "user", "content": "q"}], response_model=Answer)

    assert Answer.model_validate_json(resp.text).value == 3
    assert requests[0]["response_format"]["json_schema"]["schema"]["properties"]["value"]["type"] == "integer"
