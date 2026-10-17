"""Admin-triggered matching: features -> scores -> agent conversations -> groups -> events -> notifications."""

import asyncio
import logging
from collections import Counter
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from unifai_agent import AgentProfile, GroupVerdict, Transcript, Verdict

from app import repo
from app.config import get_settings
from app.db import pool
from app.deps import get_judge, get_llm
from app.matching.features import Feature, extract_features
from app.matching.groups import build_groups, review_groups
from app.matching.pairing import simulate_pair
from app.matching.scoring import candidate_pairs, score_profiles
from app.services import photon, ticketmaster

log = logging.getLogger(__name__)


async def run_matching(universe_id: UUID) -> None:
    settings = get_settings()
    llm, judge = get_llm(), get_judge()

    async with pool.connection() as conn:
        await repo.set_universe_status(conn, universe_id, "matching")
        try:
            profiles = await repo.load_profiles(conn, universe_id)
            features = await asyncio.to_thread(extract_features, llm, profiles, settings.feature_count)
            scores = await asyncio.to_thread(score_profiles, llm, profiles, features)
            await save_feature_scores(conn, universe_id, features, profiles, scores.tolist())

            semaphore = asyncio.Semaphore(settings.max_concurrent_conversations)

            async def run_pair(i: int, j: int):
                async with semaphore:
                    return await asyncio.to_thread(
                        simulate_pair, llm, judge, profiles[i], profiles[j], settings.max_conversation_turns
                    )

            candidates = candidate_pairs(scores, settings.candidate_neighbors)
            results = await asyncio.gather(*(run_pair(i, j) for i, j in candidates), return_exceptions=True)

            verdicts: dict[tuple[str, str], Verdict] = {}
            for (i, j), result in zip(candidates, results):
                if isinstance(result, BaseException):
                    log.exception("pair %s/%s failed", profiles[i].user_id, profiles[j].user_id, exc_info=result)
                    continue
                transcript, verdict = result
                key = tuple(sorted((profiles[i].user_id, profiles[j].user_id)))
                await save_pair(conn, universe_id, key, transcript, verdict)
                verdicts[key] = verdict

            by_id = {p.user_id: p for p in profiles}
            groups = build_groups(
                list(by_id),
                {k: v.edge_weight for k, v in verdicts.items()},
                settings.min_group_size,
                settings.max_group_size,
            )
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


async def save_feature_scores(
    conn: AsyncConnection,
    universe_id: UUID,
    features: list[Feature],
    profiles: list[AgentProfile],
    scores: list[list[float]],
) -> None:
    await conn.execute("DELETE FROM features WHERE universe_id = %s", (universe_id,))
    feature_ids = []
    for f in features:
        row = await (
            await conn.execute(
                "INSERT INTO features (universe_id, name, description) VALUES (%s, %s, %s) RETURNING id",
                (universe_id, f.name, f.description),
            )
        ).fetchone()
        feature_ids.append(row["id"])
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO user_feature_scores (user_id, feature_id, score) VALUES (%s, %s, %s)",
            [(p.user_id, fid, s) for p, row in zip(profiles, scores) for fid, s in zip(feature_ids, row)],
        )
    await conn.commit()


async def save_pair(
    conn: AsyncConnection, universe_id: UUID, key: tuple[str, str], transcript: Transcript, verdict: Verdict
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
