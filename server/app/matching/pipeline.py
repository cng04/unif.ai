"""Admin-triggered matching:
keywords -> scores -> hard filter -> top-M ranking -> agent chats + judge -> CP-SAT groups -> group judge
-> matched; then, in the background, plans (events) and notifications per group."""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import numpy as np
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from unifai_agent import GroupVerdict, Transcript, Verdict

from app import repo
from app.config import get_settings
from app.db import pool
from app.deps import get_chat_llms, get_jevs, get_judges, get_llm
from app.matching.groups import build_groups, review_group
from app.matching.keywords import Keyword, extract_keywords
from app.matching.pairing import simulate_pair
from app.matching.plans import plan_groups
from app.matching.scoring import (
    PersonSignals,
    Signals,
    candidate_pairs,
    hard_conflicts,
    score_person,
    to_signals,
)

log = logging.getLogger(__name__)

PairKey = tuple[str, str]

_plan_tasks: set[asyncio.Task] = set()


def pair_key(a: str, b: str) -> PairKey:
    return (a, b) if a < b else (b, a)


async def run_matching(universe_id: UUID) -> None:
    settings = get_settings()
    llm, chat_llms, jevs, judges = get_llm(), get_chat_llms(), get_jevs(), get_judges()
    semaphore = asyncio.Semaphore(settings.max_concurrent_conversations)
    # asyncio.to_thread's default pool has min(32, cpu + 4) threads, which would cap concurrency below the setting.
    executor = ThreadPoolExecutor(max_workers=settings.max_concurrent_conversations)

    async def limited(fn, *args):
        async with semaphore:
            return await asyncio.get_running_loop().run_in_executor(executor, fn, *args)

    log.info("Starting matching for universe %s", universe_id)
    pipeline_start = time.time()
    group_ids: list[UUID] = []

    async with pool.connection() as conn:
        await repo.set_universe_status(conn, universe_id, "matching")
        try:
            # Stage 1: Clear previous results
            stage_start = time.time()
            await clear_results(conn, universe_id)
            log.info("Cleared previous results for universe %s (took %.2fs)", universe_id, time.time() - stage_start)

            # Stage 2: Load profiles
            stage_start = time.time()
            profiles = await repo.load_profiles(conn, universe_id)
            ids = [p.user_id for p in profiles]
            documents = await repo.load_onboarding_documents(conn, profiles)
            log.info("Loaded %d profiles for universe %s (took %.2fs)", len(profiles), universe_id, time.time() - stage_start)

            # Stage 3: Extract keywords
            stage_start = time.time()
            keywords = await asyncio.to_thread(extract_keywords, llm, documents, settings.keyword_count)
            if not keywords:
                log.error("No keywords extracted, cannot continue matching")
                await repo.set_universe_status(conn, universe_id, "onboarding")
                return
            log.info("Extracted %d keywords for universe %s (took %.2fs)", len(keywords), universe_id, time.time() - stage_start)

            # Stage 4: Score each person
            stage_start = time.time()
            scored = await asyncio.gather(
                *(limited(score_person, jevs[n % len(jevs)], d, keywords) for n, d in enumerate(documents)),
                return_exceptions=True,
            )
            people = []
            failed_scoring = []
            for user_id, result in zip(ids, scored):
                if isinstance(result, BaseException):
                    log.exception("scoring %s failed", user_id, exc_info=result)
                    failed_scoring.append(user_id)
                    result = PersonSignals(scores=[])
                people.append(result)
            if failed_scoring:
                log.warning("Scoring failed for %d users: %s", len(failed_scoring), failed_scoring)
            signals = to_signals(people, keywords)
            log.info("Model scoring returned for %d users; saving keyword signals", len(profiles))
            await save_signals(conn, universe_id, ids, keywords, signals)
            log.info("Scored %d users for universe %s (took %.2fs)", len(profiles), universe_id, time.time() - stage_start)

            # Stage 5: Hard filter and candidate ranking
            stage_start = time.time()
            blocked = hard_conflicts(signals)
            candidates = candidate_pairs(signals.scores, blocked, settings.top_m)
            log.info(
                "Filtered to %d candidate pairs from %d possible pairs (took %.2fs)",
                len(candidates),
                len(ids) * (len(ids) - 1) // 2,
                time.time() - stage_start,
            )

            # Stage 6: Agent conversations and judge (stream each pair to DB as it completes)
            stage_start = time.time()
            verdicts: dict[PairKey, Verdict] = {}
            failed_conversations: list[tuple[str, str]] = []
            db_lock = asyncio.Lock()
            log.info(
                "Starting %d agent conversations with concurrency %d across chat models: %s",
                len(candidates),
                settings.max_concurrent_conversations,
                ", ".join(
                    f"{getattr(model, 'model', type(model).__name__)}"
                    f"@{getattr(model, 'chat_temperature', 'profile')}"
                    f"±{getattr(model, 'temperature_jitter', 0)}"
                    for model in chat_llms
                ),
            )

            async def run_and_save_pair(n: int, i: int, j: int) -> None:
                try:
                    transcript, verdict = await limited(
                        simulate_pair,
                        chat_llms[n % len(chat_llms)],
                        judges[n % len(judges)],
                        profiles[i],
                        profiles[j],
                        settings.max_conversation_turns,
                    )
                except Exception:
                    log.exception("pair %s/%s failed", ids[i], ids[j])
                    failed_conversations.append((ids[i], ids[j]))
                    return
                key = pair_key(ids[i], ids[j])
                async with db_lock:
                    await save_pair(conn, universe_id, key, transcript, verdict)
                verdicts[key] = verdict

            await asyncio.gather(*(run_and_save_pair(n, i, j) for n, (i, j) in enumerate(candidates)))
            if failed_conversations:
                log.warning("Conversations failed for %d pairs", len(failed_conversations))
            log.info("Completed %d agent conversations (took %.2fs)", len(verdicts), time.time() - stage_start)

            # Stage 7: Group formation
            stage_start = time.time()
            forbidden = {pair_key(ids[i], ids[j]) for i, j in zip(*np.nonzero(np.triu(blocked)))}
            forbidden |= {k for k, v in verdicts.items() if v.has_conflict}
            groups = await asyncio.to_thread(
                build_groups,
                ids,
                {k: v.edge_weight for k, v in verdicts.items()},
                forbidden,
                settings.min_group_size,
                settings.max_group_size,
                settings.group_solver_seconds,
            )
            if not groups:
                log.warning("No groups formed, cannot continue to event discovery")
                await repo.set_universe_status(conn, universe_id, "onboarding")
                return
            log.info("Formed %d groups (took %.2fs)", len(groups), time.time() - stage_start)

            # Stage 8: Group review
            stage_start = time.time()
            by_id = {p.user_id: p for p in profiles}
            reviewed = await asyncio.gather(
                *(limited(review_group, judges[0], g, by_id, verdicts, settings.min_group_size) for g in groups)
            )

            saved = [await save_group(conn, universe_id, members, v) for members, v in reviewed]
            log.info("Reviewed and saved %d groups (took %.2fs)", len(saved), time.time() - stage_start)

            await repo.set_universe_status(conn, universe_id, "matched")
            total_time = time.time() - pipeline_start
            log.info("Matching completed for universe %s in %.2fs", universe_id, total_time)
            group_ids = saved
        except asyncio.CancelledError:
            log.warning("matching cancelled for universe %s", universe_id)
            raise
        except Exception:
            log.exception("matching failed for universe %s", universe_id)
            await conn.rollback()
            await repo.set_universe_status(conn, universe_id, "onboarding")
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    # Stage 9: plans take minutes per group (web search), so they run after the universe shows as matched, outside
    # the pipeline's connection, and as their own task: the matching run (which an admin can abort) ends here.
    # Groups show "finding plans" until each one is done.
    if group_ids:
        task = asyncio.create_task(plan_groups(group_ids))
        _plan_tasks.add(task)  # keep a reference so the task isn't garbage-collected mid-run
        task.add_done_callback(_plan_tasks.discard)


async def clear_results(conn: AsyncConnection, universe_id: UUID) -> None:
    await conn.execute("DELETE FROM pairs WHERE universe_id = %s", (universe_id,))
    await conn.execute("DELETE FROM groups WHERE universe_id = %s", (universe_id,))
    await conn.commit()


async def save_signals(
    conn: AsyncConnection, universe_id: UUID, ids: list[str], keywords: list[Keyword], signals: Signals
) -> None:
    await conn.execute("DELETE FROM keywords WHERE universe_id = %s", (universe_id,))
    rows = await (
        await conn.execute(
            "INSERT INTO keywords (universe_id, name, description) "
            "SELECT %s, unnest(%s::text[]), unnest(%s::text[]) RETURNING id",
            (universe_id, [kw.name for kw in keywords], [kw.description for kw in keywords]),
        )
    ).fetchall()
    keyword_ids = [r["id"] for r in rows]
    score_rows = [
        (user_id, kid, float(signals.scores[i, k]), bool(signals.dealbreakers[i, k]))
        for i, user_id in enumerate(ids)
        for k, kid in enumerate(keyword_ids)
    ]
    if score_rows:
        await conn.execute(
            "INSERT INTO keyword_scores (user_id, keyword_id, score, dealbreaker) "
            "SELECT unnest(%s::uuid[]), unnest(%s::int[]), unnest(%s::double precision[]), unnest(%s::boolean[])",
            (
                [r[0] for r in score_rows],
                [r[1] for r in score_rows],
                [r[2] for r in score_rows],
                [r[3] for r in score_rows],
            ),
        )
    if ids:
        async with conn.cursor() as cur:
            await cur.executemany(
                "UPDATE agent_profiles SET availability = %s WHERE user_id = %s",
                [(sorted(slots), user_id) for user_id, slots in zip(ids, signals.availability)],
            )
    await conn.commit()


async def save_pair(
    conn: AsyncConnection, universe_id: UUID, key: PairKey, transcript: Transcript, verdict: Verdict
) -> None:
    row = await (
        await conn.execute(
            """
            INSERT INTO pairs (universe_id, user_a, user_b, vibe_score, dealbreaker_flags,
                               logistics_fit, judge_rationale, end_reason)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (universe_id, user_a, user_b) DO UPDATE SET
                vibe_score = EXCLUDED.vibe_score, dealbreaker_flags = EXCLUDED.dealbreaker_flags,
                logistics_fit = EXCLUDED.logistics_fit, judge_rationale = EXCLUDED.judge_rationale,
                end_reason = EXCLUDED.end_reason
            RETURNING id
            """,
            (
                universe_id, *key, verdict.vibe_score, Jsonb(verdict.dealbreaker_conflicts),
                verdict.logistics_fit, verdict.rationale, transcript.end_reason,
            ),
        )
    ).fetchone()
    await conn.execute("DELETE FROM pair_messages WHERE pair_id = %s", (row["id"],))
    rows = [(uid, "message", text) for uid, text in transcript.messages]
    rows += [(uid, "note", note) for uid, notes in transcript.notes.items() for note in notes]
    if rows:
        await conn.execute(
            "INSERT INTO pair_messages (pair_id, speaker_id, kind, content) "
            "SELECT %s, unnest(%s::uuid[]), unnest(%s::text[]), unnest(%s::text[])",
            (
                row["id"],
                [uid for uid, _, _ in rows],
                [kind for _, kind, _ in rows],
                [content for _, _, content in rows],
            ),
        )
    await conn.commit()


async def save_group(conn: AsyncConnection, universe_id: UUID, members: list[str], verdict: GroupVerdict) -> UUID:
    row = await (
        await conn.execute(
            "INSERT INTO groups (universe_id, group_score, rationale) VALUES (%s, %s, %s) RETURNING id",
            (universe_id, verdict.group_score, verdict.rationale),
        )
    ).fetchone()
    if members:
        await conn.execute(
            "INSERT INTO group_members (group_id, user_id) SELECT %s, unnest(%s::uuid[])",
            (row["id"], members),
        )
    await conn.commit()
    return row["id"]
