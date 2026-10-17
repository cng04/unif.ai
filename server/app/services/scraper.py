"""Scrape a user's public LinkedIn and social profiles with Browser Use (install with the `scrape` extra)."""

import logging

from app.config import get_settings

log = logging.getLogger(__name__)

TASK = """\
Visit {url} and summarize {name}'s public profile: headline, current role or school, interests, \
hobbies, recent posts or activity themes. Skip anything private or sensitive. Return plain text.
"""


async def scrape_profiles(full_name: str, links: dict[str, str]) -> dict[str, str]:
    try:
        from browser_use import Agent, ChatGoogle
    except ImportError:
        log.warning("browser-use not installed; skipping scrape for %s", full_name)
        return {}

    results: dict[str, str] = {}
    for platform, url in links.items():
        try:
            agent = Agent(task=TASK.format(url=url, name=full_name), llm=ChatGoogle(model=get_settings().gemini_model))
            history = await agent.run(max_steps=15)
            results[platform] = history.final_result() or ""
        except Exception:
            log.exception("scrape failed for %s (%s)", full_name, platform)
    return results
