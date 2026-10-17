-- Fake matching output for the seeded demo universe, so GET /universes/{id}/graph has something to draw
-- without running the LLM pipeline. Run by hand after seed.sql; safe to re-run. A real matching run
-- replaces all of it.
--   docker exec -i unifai-db psql -U unifai -d unifai < db/dev_graph_seed.sql

BEGIN;

DELETE FROM keywords WHERE universe_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM groups   WHERE universe_id = '00000000-0000-0000-0000-000000000001';

-- 7 clusters, 2 keywords each.
CREATE TEMP TABLE dev_kw (cluster INT, name TEXT) ON COMMIT DROP;
INSERT INTO dev_kw VALUES
    (0, 'hiking'), (0, 'climbing'),
    (1, 'board games'), (1, 'video games'),
    (2, 'painting'), (2, 'live music'),
    (3, 'cooking'), (3, 'brunch'),
    (4, 'running'), (4, 'lifting'),
    (5, 'reading'), (5, 'writing'),
    (6, 'clubbing'), (6, 'cocktails');

INSERT INTO keywords (universe_id, name)
SELECT '00000000-0000-0000-0000-000000000001', name FROM dev_kw;

-- 30 seeded users split into 7 contiguous clusters of 4-5.
CREATE TEMP TABLE dev_user ON COMMIT DROP AS
SELECT id AS user_id, ((row_number() OVER (ORDER BY id)) - 1) * 7 / 30 AS cluster
FROM users WHERE universe_id = '00000000-0000-0000-0000-000000000001';

-- Deterministic noise in [0, 1) from md5 so re-runs give the same picture.
INSERT INTO keyword_scores (user_id, keyword_id, score)
SELECT u.user_id, k.id,
       CASE WHEN d.cluster = u.cluster THEN 0.75 + 0.2 * n.r ELSE 0.15 + 0.4 * n.r END
FROM dev_user u
CROSS JOIN keywords k
JOIN dev_kw d ON d.name = k.name
CROSS JOIN LATERAL (
    SELECT ('x' || substr(md5(u.user_id::text || k.name), 1, 8))::bit(32)::bigint / 4294967296.0 AS r
) n
WHERE k.universe_id = '00000000-0000-0000-0000-000000000001';

-- One group per cluster.
INSERT INTO groups (id, universe_id, group_score, rationale)
SELECT md5('dev-group-' || cluster)::uuid, '00000000-0000-0000-0000-000000000001', 7.5, 'dev seed'
FROM (SELECT DISTINCT cluster FROM dev_user) c;

INSERT INTO group_members (group_id, user_id)
SELECT md5('dev-group-' || cluster)::uuid, user_id FROM dev_user;

UPDATE universes SET status = 'matched' WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;
