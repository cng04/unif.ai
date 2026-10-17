import asyncio
from enum import Enum
from types import SimpleNamespace

import browser_use_sdk.v4 as bu

from app.config import get_settings
from app.services import scraper


class Status(Enum):
    completed = "completed"
    failed = "failed"


class FakeRuns:
    def __init__(self):
        self.created, self.cancelled = [], []

    async def create(self, task, model, max_cost_usd):
        self.created.append((task, model, max_cost_usd))
        return SimpleNamespace(id=f"run{len(self.created)}")

    async def wait_for_completion(self, run_id, timeout):
        task = self.created[int(run_id[3:]) - 1][0]
        if "goodreads" in task:
            raise TimeoutError
        status = Status.failed if "strava" in task else Status.completed
        return SimpleNamespace(status=status, result=f"summary of {task.split()[1]}", total_cost_usd="0.01")

    async def cancel(self, run_id):
        self.cancelled.append(run_id)


class FakeClient:
    runs = FakeRuns()

    def __init__(self, api_key):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def test_scrape_profiles(monkeypatch):
    monkeypatch.setattr(bu, "AsyncBrowserUse", FakeClient)
    get_settings.cache_clear()
    monkeypatch.setenv("BROWSER_USE_API_KEY", "test")
    monkeypatch.setenv("SCRAPE_ENABLED", "true")
    links = {
        "letterboxd": "https://letterboxd.com/cyn",
        "goodreads": "https://goodreads.com/cyn",  # times out -> cancelled
        "strava": "https://strava.com/athletes/1",  # run fails
        "instagram": "https://instagram.com/cyn",  # skipped by default
        "x": "@cyn",  # not a URL
    }
    out = asyncio.run(scraper.scrape_profiles("Cyn Lee", links))
    assert out == {"letterboxd": "summary of https://letterboxd.com/cyn"}
    assert len(FakeClient.runs.created) == 3
    assert all(c[2] == 0.05 for c in FakeClient.runs.created)
    assert FakeClient.runs.cancelled == ["run2"] or len(FakeClient.runs.cancelled) == 1
    get_settings.cache_clear()


def test_scrape_disabled_without_key(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("BROWSER_USE_API_KEY", "")
    assert asyncio.run(scraper.scrape_profiles("Cyn", {"letterboxd": "https://letterboxd.com/cyn"})) == {}
    get_settings.cache_clear()


def test_scrape_off_by_default(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("BROWSER_USE_API_KEY", "test")
    monkeypatch.delenv("SCRAPE_ENABLED", raising=False)
    assert asyncio.run(scraper.scrape_profiles("Cyn", {"letterboxd": "https://letterboxd.com/cyn"})) == {}
    get_settings.cache_clear()
