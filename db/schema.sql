CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A "universe" is one admin-run pool of people to be matched (e.g. a hackathon, a club).
CREATE TABLE universes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    admin_email  TEXT NOT NULL,
    invite_code  TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'onboarding'
                 CHECK (status IN ('onboarding', 'matching', 'matched')),
    -- Demo/test universes (seeded fixtures, synthetic people), kept apart from real ones.
    is_demo      BOOLEAN NOT NULL DEFAULT false,
    -- The matching stage running now (NULL outside a run), for the World's live progress.
    matching_stage    TEXT CHECK (matching_stage IN ('keywords', 'scoring', 'chats', 'groups')),
    matching_stage_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universe_id   UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    full_name     TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    -- ASI:One sender address (agent1q...), for people who onboard through the ASI:One agent.
    asi_address   TEXT,
    social_links  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent profile built from onboarding: scraped socials + pasted AI-prompt output + interview chat.
CREATE TABLE agent_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public         JSONB NOT NULL DEFAULT '{}'::jsonb,
    private        JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_sources    JSONB NOT NULL DEFAULT '{}'::jsonb,
    temperature    REAL NOT NULL DEFAULT 0.7,
    -- Normalized free-time slots set during matching; empty means unknown or flexible.
    availability   TEXT[] NOT NULL DEFAULT '{}',
    embedding      vector(768),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_messages (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- k keywords discovered across a universe's onboarding transcripts, and each user's 0-1 score per keyword.
-- 0.5 means "no signal". dealbreaker = this user can't be grouped with someone who scores above 0.5 on it.
CREATE TABLE keywords (
    id           SERIAL PRIMARY KEY,
    universe_id  UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    UNIQUE (universe_id, name)
);

CREATE TABLE keyword_scores (
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword_id   INT  NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    score        REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
    dealbreaker  BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, keyword_id)
);

-- Agent-to-agent conversations between two users, plus the judge's verdict.
CREATE TABLE pairs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universe_id        UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    user_a             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vibe_score         REAL,
    dealbreaker_flags  JSONB NOT NULL DEFAULT '[]'::jsonb,
    logistics_fit      TEXT CHECK (logistics_fit IN ('strong', 'workable', 'incompatible')),
    judge_rationale    TEXT,
    end_reason         TEXT,
    -- 'running' from the moment the agents start talking; 'complete' once judged (transcript written then).
    status             TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('running', 'complete')),
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (universe_id, user_a, user_b),
    CHECK (user_a < user_b)
);

CREATE TABLE pair_messages (
    id          BIGSERIAL PRIMARY KEY,
    pair_id     UUID NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
    speaker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('message', 'note')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universe_id  UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    group_score  REAL,
    rationale    TEXT,
    -- Event search runs after matching: pending -> ready (plans found) or none (nothing found).
    plans_status  TEXT NOT NULL DEFAULT 'pending' CHECK (plans_status IN ('pending', 'ready', 'none')),
    -- What the plans were picked for, e.g. "Picked for when you're all free, at $$ or under."
    plans_summary TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id       UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    source         TEXT NOT NULL DEFAULT 'ticketmaster',
    external_id    TEXT,
    name           TEXT NOT NULL,
    url            TEXT,
    venue          TEXT,
    starts_at      TIMESTAMPTZ,
    -- Venue-local wall time, e.g. "sat 25 · 10:00", so the client never has to guess a time zone.
    time_label     TEXT,
    price          TEXT,
    reason         TEXT,
    rank           INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON users (universe_id);
CREATE INDEX ON users (asi_address);
CREATE INDEX ON pairs (universe_id);
CREATE INDEX ON pair_messages (pair_id);
CREATE INDEX ON groups (universe_id);
