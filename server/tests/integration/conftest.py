"""Integration test fixtures with database setup and mock data."""

from uuid import uuid4

import pytest
from psycopg import AsyncConnection


@pytest.fixture
async def test_universe(test_db_conn: AsyncConnection):
    """A throwaway universe; deleting it cascades to every dependent row."""
    universe_id = uuid4()
    await test_db_conn.execute(
        "INSERT INTO universes (id, name, admin_email, invite_code, status) VALUES (%s, %s, %s, %s, %s)",
        (universe_id, "Test Universe", "test@example.com", f"test-{universe_id.hex[:8]}", "onboarding"),
    )
    await test_db_conn.commit()
    yield universe_id
    await test_db_conn.execute("DELETE FROM universes WHERE id = %s", (universe_id,))
    await test_db_conn.commit()


@pytest.fixture
def mock_onboarding_document():
    """Mock onboarding document for testing."""
    return """
PROFILE:
{"public": {"name": "Test User", "interests": ["hiking", "coding"], "vibe": "friendly"}, 
 "private": {"dealbreakers": ["heavy drinking"], "values": ["reliability"]}}

INTERVIEW:
user: Hi, I'm looking to meet new people
assistant: That's great! What do you enjoy doing in your free time?
user: I like hiking and coding
assistant: Nice! What kind of social energy do you prefer?
user: I prefer small groups, I'm a bit introverted
assistant: Got it. Are there any dealbreakers for you?
user: I can't handle heavy drinking culture
    """


@pytest.fixture
def mock_llm():
    """Mock LLM for testing without API calls."""
    from unifai_agent.llm import LLM, LLMResponse, ToolCall
    from typing import Any, Protocol
    from dataclasses import dataclass, field
    
    @dataclass
    class MockLLM:
        def generate(
            self,
            system: str,
            history,
            *,
            tools=None,
            temperature=0.7,
            response_model=None,
        ) -> LLMResponse:
            # Return a simple response for testing
            if response_model:
                # Return JSON that can be parsed into the model
                return LLMResponse(text='{"scores": [], "dealbreakers": [], "availability": []}')
            return LLMResponse(text="Test response")
        
        def embed(self, texts):
            # Return dummy embeddings
            return [[0.0] * 768 for _ in texts]
    
    return MockLLM()


@pytest.fixture
def mock_jev():
    """Mock Jev for testing without API calls."""
    from unifai_agent.jev import Jev
    from typing import Any, Mapping
    from dataclasses import dataclass
    
    @dataclass
    class MockJevResult:
        scores: dict
        nouls: dict
        choices: dict
    
    @dataclass
    class MockJev:
        def system_one(self, state: Any, questions: Mapping[str, Any]) -> MockJevResult:
            # Return mock responses for testing
            scores = {}
            nouls = {}
            choices = {}
            
            for key, question in questions.items():
                if "score" in key:
                    scores[key] = type('Score', (), {'score': 0.5, 'confidence': 0.8})()
                elif "dealbreaker" in key:
                    nouls[key] = type('Noul', (), {'noul': 0.1})()
                elif "availability" in key or "free" in key:
                    nouls[key] = type('Noul', (), {'noul': 0.8})()
                elif "logistics" in key:
                    choices[key] = type('Choice', (), {'choice': 'workable'})()
            
            return MockJevResult(scores=scores, nouls=nouls, choices=choices)
    
    return MockJev()
