-- For databases created before the World snapshot (schema.sql already has these). Safe to re-run.

-- Demo/test universes (seeded fixtures, synthetic people) are kept apart from real ones in the admin and World.
ALTER TABLE universes ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Which matching stage is running right now, so the World shows real progress instead of guessing.
ALTER TABLE universes ADD COLUMN IF NOT EXISTS matching_stage TEXT;
ALTER TABLE universes ADD COLUMN IF NOT EXISTS matching_stage_at TIMESTAMPTZ;
ALTER TABLE universes DROP CONSTRAINT IF EXISTS universes_matching_stage_check;
ALTER TABLE universes ADD CONSTRAINT universes_matching_stage_check
    CHECK (matching_stage IN ('keywords', 'scoring', 'chats', 'groups'));

-- A pair row exists from the moment its agents start talking ('running'), and gets its verdict when the chat
-- completes. Transcripts are written on completion.
ALTER TABLE pairs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE pairs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE pairs DROP CONSTRAINT IF EXISTS pairs_status_check;
ALTER TABLE pairs ADD CONSTRAINT pairs_status_check CHECK (status IN ('running', 'complete'));
UPDATE pairs SET completed_at = created_at WHERE status = 'complete' AND completed_at IS NULL;

-- The seeded fixtures are test data.
UPDATE universes SET is_demo = true WHERE invite_code IN ('lahacks', 'ui-demo');
