"""Summarize a user's public social profiles with Browser Use Cloud (install with the `scrape` extra).

Each link becomes one cloud run that reads the public page and writes a short plain-text summary.
Runs happen in parallel, each with a hard spend cap. Scraped text is untrusted web content, so
consumers must treat it as data, never as instructions.
"""

import asyncio
import logging

from app.config import get_settings

log = logging.getLogger(__name__)

TASK = """\
Open {url} and summarize what this public profile says about {name}: interests, tastes, hobbies, \
current role or school, and recurring themes in recent activity (for example favorite films, books \
being read, sports logged). Use only what is visible without logging in. If the page needs a login, \
is private, or doesn't exist, say so in one sentence and stop. Skip anything sensitive (health, \
finances, named people in their life). Reply in under 150 words of plain text.
"""


async def scrape_profiles(full_name: str, links: dict[str, str]) -> dict[str, str]:
    """Return {platform: summary} for the links that scraped successfully."""
    settings = get_settings()
    if not settings.scrape_enabled:
        log.info("[scrape disabled] SCRAPE_ENABLED is off; storing links only for %s", full_name)
        return {}
    if not settings.browser_use_api_key:
        log.info("[scrape disabled] BROWSER_USE_API_KEY not set; skipping %s", full_name)
        return {}
    try:
        from browser_use_sdk.v4 import AsyncBrowserUse
    except ImportError:
        log.warning("browser-use-sdk not installed (uv sync --extra scrape); skipping %s", full_name)
        return {}

    skip = {p.strip().lower() for p in settings.scrape_skip_platforms.split(",") if p.strip()}
    todo = {p: url for p, url in links.items() if p.lower() not in skip and url.startswith(("http://", "https://"))}
    if not todo:
        return {}

    async with AsyncBrowserUse(api_key=settings.browser_use_api_key) as client:

        async def one(platform: str, url: str) -> tuple[str, str | None]:
            run_id = None
            try:
                created = await client.runs.create(
                    task=TASK.format(url=url, name=full_name),
                    model=settings.scrape_model,
                    max_cost_usd=settings.scrape_max_cost_usd,
                )
                run_id = created.id
                run = await client.runs.wait_for_completion(run_id, timeout=settings.scrape_timeout_s)
                status = getattr(run.status, "value", run.status)
                log.info("scraped %s for %s: %s, $%s", platform, full_name, status, run.total_cost_usd)
                return platform, (run.result or None) if status == "completed" else None
            except Exception:
                log.exception("scrape failed for %s (%s)", full_name, platform)
                if run_id:  # stop billing for a run we gave up on
                    try:
                        await client.runs.cancel(run_id)
                    except Exception:
                        pass
                return platform, None

        results = await asyncio.gather(*(one(p, u) for p, u in todo.items()))
    return {platform: text for platform, text in results if text}
