-- For databases created before asi_address was added to schema.sql. Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS asi_address TEXT;
CREATE INDEX IF NOT EXISTS users_asi_address_idx ON users (asi_address);
