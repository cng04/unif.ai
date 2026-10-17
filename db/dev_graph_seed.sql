-- Fake matching output for the seeded demo universe: what Jev and the judge would have written (keyword
-- scores, dealbreakers, availability, judged pairs) plus groups, so /graph, /pairs and /groups have data
-- without running the LLM pipeline. Run by hand after seed.sql; safe to re-run. A real matching run
-- replaces all of it.
--   docker exec -i unifai-db psql -U unifai -d unifai < db/dev_graph_seed.sql

BEGIN;

DELETE FROM keywords WHERE universe_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM pairs    WHERE universe_id = '00000000-0000-0000-0000-000000000001';
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

-- Dealbreakers: the books cluster avoids clubbing, the fitness cluster avoids cocktails. Nightlife people
-- score above 0.5 on both, so those pairs are hard-blocked, as in hard_conflicts.
UPDATE keyword_scores ks SET dealbreaker = true
FROM dev_user u, keywords k
WHERE ks.user_id = u.user_id AND ks.keyword_id = k.id AND k.universe_id = '00000000-0000-0000-0000-000000000001'
  AND ((u.cluster = 5 AND k.name = 'clubbing') OR (u.cluster = 4 AND k.name = 'cocktails'));

-- Availability slots (the fixed slots from scoring.py), one pattern per cluster.
UPDATE agent_profiles ap SET availability = CASE u.cluster
    WHEN 0 THEN ARRAY['weekend_daytime']
    WHEN 1 THEN ARRAY['weekday_evening', 'weekend_evening']
    WHEN 2 THEN ARRAY['weekend_daytime', 'weekend_evening']
    WHEN 3 THEN ARRAY['weekday_evening', 'weekend_daytime']
    WHEN 4 THEN ARRAY['weekday_daytime', 'weekend_daytime']
    WHEN 5 THEN ARRAY['weekday_evening']
    ELSE ARRAY['weekend_evening']
END
FROM dev_user u WHERE ap.user_id = u.user_id;

-- Judged pairs: each person's top 3 unblocked matches by cosine similarity (top_m is 5 in prod).
-- Vibe uses the judge's 5 chemistry levels (1, 3.25, 5.5, 7.75, 10).
INSERT INTO pairs (universe_id, user_a, user_b, vibe_score, logistics_fit, judge_rationale, end_reason)
WITH v AS (
    SELECT ks.user_id, ks.keyword_id, ks.score, ks.dealbreaker FROM keyword_scores ks JOIN dev_user USING (user_id)
), norms AS (
    SELECT user_id, sqrt(sum(score * score)) AS n FROM v GROUP BY user_id
), sim AS (
    SELECT a.user_id AS ua, b.user_id AS ub, sum(a.score * b.score) / (na.n * nb.n) AS cos,
           bool_or((a.dealbreaker AND b.score > 0.5) OR (b.dealbreaker AND a.score > 0.5)) AS blocked
    FROM v a
    JOIN v b ON b.keyword_id = a.keyword_id AND b.user_id <> a.user_id
    JOIN norms na ON na.user_id = a.user_id
    JOIN norms nb ON nb.user_id = b.user_id
    GROUP BY a.user_id, b.user_id, na.n, nb.n
), ranked AS (
    SELECT ua, ub, row_number() OVER (PARTITION BY ua ORDER BY cos DESC) AS rk FROM sim WHERE NOT blocked
), picked AS (
    SELECT DISTINCT LEAST(ua, ub) AS ua, GREATEST(ua, ub) AS ub FROM ranked WHERE rk <= 3
), judged AS (
    SELECT p.ua, p.ub, ca.cluster = cb.cluster AS same,
           ('x' || substr(md5(p.ua::text || p.ub::text), 1, 8))::bit(32)::bigint / 4294967296.0 AS r
    FROM picked p
    JOIN dev_user ca ON ca.user_id = p.ua
    JOIN dev_user cb ON cb.user_id = p.ub
), verdict AS (
    SELECT ua, ub, r,
           CASE WHEN same THEN (CASE WHEN r < 0.4 THEN 10 ELSE 7.75 END)
                ELSE (CASE WHEN r < 0.5 THEN 5.5 ELSE 3.25 END) END AS vibe,
           CASE WHEN same THEN 'strong' WHEN r < 0.1 THEN 'incompatible' ELSE 'workable' END AS fit
    FROM judged
)
SELECT '00000000-0000-0000-0000-000000000001', ua, ub, vibe, fit,
       format('Chemistry %s/10 (confidence %s); logistics %s; dealbreakers: none.',
              to_char(vibe, 'FM90.0'), to_char(0.6 + 0.35 * r, 'FM0.00'), fit),
       'max_turns'
FROM verdict;

-- One group per cluster.
INSERT INTO groups (id, universe_id, group_score, rationale)
SELECT md5('dev-group-' || cluster)::uuid, '00000000-0000-0000-0000-000000000001', 8, 'dev seed: everyone shares the same core interests'
FROM (SELECT DISTINCT cluster FROM dev_user) c;

INSERT INTO group_members (group_id, user_id)
SELECT md5('dev-group-' || cluster)::uuid, user_id FROM dev_user;

UPDATE universes SET status = 'matched' WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;
