-- For databases created before group plans (event search) were added to schema.sql. Safe to re-run.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS plans_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS plans_summary TEXT;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_plans_status_check;
ALTER TABLE groups ADD CONSTRAINT groups_plans_status_check CHECK (plans_status IN ('pending', 'ready', 'none'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_label TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS price TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rank INT;
