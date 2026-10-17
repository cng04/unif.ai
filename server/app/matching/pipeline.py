"""Admin-triggered matching:
keywords -> scores -> hard filter -> top-M ranking -> agent chats + judge -> CP-SAT groups -> group judge
-> events -> notifications."""

import asyncio
import logging
from collections import Counter
from uuid import UUID

import numpy as np
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from unifai_agent import AgentProfile, GroupVerdict, Transcript, Verdict

from app import repo
from app.config import get_settings
from app.db import pool
from app.deps import get_judge, get_llm
from app.matching.groups import build_groups, review_groups
from app.matching.keywords import Keyword, extract_keywords
from app.matching.pairing import simulate_pair
from app.matching.scoring import (
    PersonSignals,
    Signals,
    candidate_pairs,
    hard_conflicts,
    score_person,
    to_signals,
)
from app.services import photon, ticketmaster

log = logging.getLogger(__name__)

PairKey = tuple[str, str]


def pair_key(a: str, b: str) -> PairKey:
    return (a, b) if a < b else (b, a)


async def run_matching(universe_id: UUID) -> None:
    settings = get_settings()
    llm, judge = get_llm(), get_judge()
    semaphore = asyncio.Semaphore(settings.max_concurrent_conversations)

    async def limited(fn, *args):
        async with semaphore:
            return await asyncio.to_thread(fn, *args)

    async with pool.connection() as conn:
        await repo.set_universe_status(conn, universe_id, "matching")
        try:
            await clear_results(conn, universe_id)
            profiles = await repo.load_profiles(conn, universe_id)
            ids = [p.user_id for p in profiles]
            documents = await repo.load_onboarding_documents(conn, profiles)

            keywords = await asyncio.to_thread(extract_keywords, llm, documents, settings.keyword_count)
            scored = await asyncio.gather(
                *(limited(score_person, llm, d, keywords) for d in documents), return_exceptions=True
            )
            people = []
            for user_id, result in zip(ids, scored):
                if isinstance(result, BaseException):
                    log.exception("scoring %s failed", user_id, exc_info=result)
                    result = PersonSignals(scores=[])
                people.append(result)
            signals = to_signals(people, keywords)
            await save_signals(conn, universe_id, ids, keywords, signals)

            blocked = hard_conflicts(signals)
            candidates = candidate_pairs(signals.scores, blocked, settings.top_m)
            results = await asyncio.gather(
                *(
                    limited(simulate_pair, llm, judge, profiles[i], profiles[j], settings.max_conversation_turns)
                    for i, j in candidates
                ),
                return_exceptions=True,
            )

            verdicts: dict[PairKey, Verdict] = {}
            for (i, j), result in zip(candidates, results):
                if isinstance(result, BaseException):
                    log.exception("pair %s/%s failed", ids[i], ids[j], exc_info=result)
                    continue
                transcript, verdict = result
                key = pair_key(ids[i], ids[j])
                await save_pair(conn, universe_id, key, transcript, verdict)
                verdicts[key] = verdict

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
            by_id = {p.user_id: p for p in profiles}
            reviewed = await asyncio.to_thread(review_groups, judge, groups, by_id, verdicts, settings.min_group_size)

            for members, group_verdict in reviewed:
                group_profiles = [by_id[m] for m in members]
                group_id = await save_group(conn, universe_id, members, group_verdict)
                events = await ticketmaster.find_events(shared_interests(group_profiles))
                await save_events(conn, group_id, events)
                users = await (
                    await conn.execute("SELECT full_name, phone FROM users WHERE id = ANY(%s::uuid[])", (members,))
                ).fetchall()
                await photon.notify_group(users, events)

            await repo.set_universe_status(conn, universe_id, "matched")
        except Exception:
            log.exception("matching failed for universe %s", universe_id)
            await conn.rollback()
            await repo.set_universe_status(conn, universe_id, "onboarding")


def shared_interests(profiles: list[AgentProfile], top: int = 3) -> list[str]:
    counts = Counter(i.lower() for p in profiles for i in p.public.interests)
    return [interest for interest, _ in counts.most_common(top)]


async def clear_results(conn: AsyncConnection, universe_id: UUID) -> None:
    await conn.execute("DELETE FROM pairs WHERE universe_id = %s", (universe_id,))
    await conn.execute("DELETE FROM groups WHERE universe_id = %s", (universe_id,))
    await conn.commit()


async def save_signals(
    conn: AsyncConnection, universe_id: UUID, ids: list[str], keywords: list[Keyword], signals: Signals
) -> None:
    await conn.execute("DELETE FROM keywords WHERE universe_id = %s", (universe_id,))
    keyword_ids = []
    for kw in keywords:
        row = await (
            await conn.execute(
                "INSERT INTO keywords (universe_id, name, description) VALUES (%s, %s, %s) RETURNING id",
                (universe_id, kw.name, kw.description),
            )
        ).fetchone()
        keyword_ids.append(row["id"])
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO keyword_scores (user_id, keyword_id, score, dealbreaker) VALUES (%s, %s, %s, %s)",
            [
                (user_id, kid, float(signals.scores[i, k]), bool(signals.dealbreakers[i, k]))
                for i, user_id in enumerate(ids)
                for k, kid in enumerate(keyword_ids)
            ],
        )
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
    rows = [(row["id"], uid, "message", text) for uid, text in transcript.messages]
    rows += [(row["id"], uid, "note", note) for uid, notes in transcript.notes.items() for note in notes]
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO pair_messages (pair_id, speaker_id, kind, content) VALUES (%s, %s, %s, %s)", rows
        )
    await conn.commit()


async def save_group(conn: AsyncConnection, universe_id: UUID, members: list[str], verdict: GroupVerdict) -> UUID:
    row = await (
        await conn.execute(
            "INSERT INTO groups (universe_id, group_score, rationale) VALUES (%s, %s, %s) RETURNING id",
            (universe_id, verdict.group_score, verdict.rationale),
        )
    ).fetchone()
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", [(row["id"], m) for m in members]
        )
    await conn.commit()
    return row["id"]


async def save_events(conn: AsyncConnection, group_id: UUID, events: list[ticketmaster.Event]) -> None:
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO events (group_id, external_id, name, url, venue, starts_at) VALUES (%s, %s, %s, %s, %s, %s)",
            [(group_id, e.external_id, e.name, e.url, e.venue, e.starts_at) for e in events],
        )
    await conn.commit()
