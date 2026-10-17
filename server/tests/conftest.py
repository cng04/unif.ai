"""Shared pytest fixtures. DB tests are skipped unless DATABASE_URL_TEST is set."""

import os
from uuid import uuid4

import pytest
from psycopg import AsyncConnection
from psycopg.rows import dict_row


@pytest.fixture
async def test_db_conn():
    url = os.environ.get("DATABASE_URL_TEST")
    if not url:
        pytest.skip("DATABASE_URL_TEST not set")
    async with await AsyncConnection.connect(url, row_factory=dict_row) as conn:
        yield conn


@pytest.fixture
def test_universe_id():
    return uuid4()


@pytest.fixture
def test_user_id():
    return uuid4()


@pytest.fixture
def mock_profile_data():
    return {
        "public": {
            "name": "Test User",
            "interests": ["hiking", "coding", "coffee"],
            "vibe": "friendly and curious",
            "looking_for": "people to explore the city with",
        },
        "private": {
            "dealbreakers": ["heavy drinking culture", "flaky plans"],
            "values": ["reliability", "curiosity"],
            "energy": "introverted but likes small groups",
            "logistics": {
                "area": "San Francisco",
                "budget": "moderate",
                "free": ["weekday_evening", "weekend_daytime"],
            },
        },
    }
