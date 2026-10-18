-- For databases created before plan voting was added to schema.sql. Safe to re-run.
ALTER TABLE events ADD COLUMN IF NOT EXISTS chosen_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS events_one_chosen_per_group ON events (group_id) WHERE chosen_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS plan_votes (
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);
