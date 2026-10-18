-- Fake matching output for the seeded demo universe: what Jev and the judge would have written (keyword
-- scores, dealbreakers, availability, judged pairs) plus groups, so /graph, /pairs and /groups have data
-- without running the LLM pipeline. Run by hand after seed.sql; safe to re-run. A real matching run
-- replaces all of it.
--   docker exec -i unifai-db psql -U unifai -d unifai < db/dev_graph_seed.sql

BEGIN;

DELETE FROM keywords WHERE universe_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM pairs    WHERE universe_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM groups   WHERE universe_id = '00000000-0000-0000-0000-000000000001';

-- 8 clusters, 2 keywords each, matching the 8 groups of 5 in seed.sql.
CREATE TEMP TABLE dev_kw (cluster INT, name TEXT) ON COMMIT DROP;
INSERT INTO dev_kw VALUES
    (0, 'hiking'), (0, 'wildlife'),
    (1, 'board games'), (1, 'video games'),
    (2, 'painting'), (2, 'museums'),
    (3, 'live music'), (3, 'songwriting'),
    (4, 'cooking'), (4, 'dinner parties'),
    (5, 'training'), (5, 'competition'),
    (6, 'reading'), (6, 'science'),
    (7, 'late nights'), (7, 'cocktails');

INSERT INTO keywords (universe_id, name)
SELECT '00000000-0000-0000-0000-000000000001', name FROM dev_kw;

-- The 40 seeded users split into 8 contiguous clusters of 5 (seed.sql orders ids by cluster).
CREATE TEMP TABLE dev_user ON COMMIT DROP AS
SELECT id AS user_id, ((row_number() OVER (ORDER BY id)) - 1) * 8 / count(*) OVER () AS cluster
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

-- Dealbreakers: the books cluster avoids late nights, the sports cluster avoids cocktails. Nightlife people
-- score above 0.5 on both, so those pairs are hard-blocked, as in hard_conflicts.
UPDATE keyword_scores ks SET dealbreaker = true
FROM dev_user u, keywords k
WHERE ks.user_id = u.user_id AND ks.keyword_id = k.id AND k.universe_id = '00000000-0000-0000-0000-000000000001'
  AND ((u.cluster = 6 AND k.name = 'late nights') OR (u.cluster = 5 AND k.name = 'cocktails'));

-- Availability slots (the fixed slots from scoring.py), one pattern per cluster.
UPDATE agent_profiles ap SET availability = CASE u.cluster
    WHEN 0 THEN ARRAY['weekend_daytime']
    WHEN 1 THEN ARRAY['weekday_evening', 'weekend_evening']
    WHEN 2 THEN ARRAY['weekend_daytime', 'weekend_evening']
    WHEN 3 THEN ARRAY['weekday_evening', 'weekend_evening']
    WHEN 4 THEN ARRAY['weekday_evening', 'weekend_daytime']
    WHEN 5 THEN ARRAY['weekday_daytime', 'weekend_daytime']
    WHEN 6 THEN ARRAY['weekday_evening']
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

-- Agent-to-agent conversations for the judged pairs: one template per cluster (-1 for cross-cluster
-- pairs), filled with first names (%1$s = user_a, %2$s = user_b) and their top shared keyword (%3$s).
CREATE TEMP TABLE dev_chat (cluster INT, turn INT, speaker CHAR(1), content TEXT) ON COMMIT DROP;
INSERT INTO dev_chat VALUES
    (0, 1, 'a', 'Hi, I''m here for %1$s. They''d happily spend all of Saturday outside, the wilder the better.'),
    (0, 2, 'b', 'Same with %2$s. Give them a trail and something to look at and they''re happy.'),
    (0, 3, 'a', 'Is %2$s okay with an early start? %1$s likes to be out by sunrise.'),
    (0, 4, 'b', 'Earlier is better. They''re most themselves around %3$s.'),
    (0, 5, 'a', 'Great, I think they''d both want a small outdoors crew.'),
    (1, 1, 'a', 'Hey! %1$s hosts a game night most weeks, usually 4-6 people.'),
    (1, 2, 'b', '%2$s would love that. They get very into it, fair warning.'),
    (1, 3, 'a', 'So does %1$s. Any games %2$s is into lately?'),
    (1, 4, 'b', 'Long strategy games mostly, and a lot of %3$s on weeknights.'),
    (1, 5, 'a', 'Good overlap. I''d put them at the same table.'),
    (2, 1, 'a', '%1$s paints most days and could spend hours in a gallery.'),
    (2, 2, 'b', '%2$s too. They''d take a quiet museum over a busy bar any day.'),
    (2, 3, 'a', 'Would %2$s be up for a sketching morning?'),
    (2, 4, 'b', 'Honestly yes. They open up around %3$s.'),
    (2, 5, 'a', 'Same with %1$s. Sounds like a good fit.'),
    (3, 1, 'a', '%1$s is writing new material and wants people to play it for.'),
    (3, 2, 'b', '%2$s would be thrilled. They''re at a show or a piano most nights.'),
    (3, 3, 'a', 'Would %2$s be up for a living-room singalong instead of a big venue sometimes?'),
    (3, 4, 'b', 'They''d love that. It''s all about %3$s for them.'),
    (3, 5, 'a', 'Then they''ll get along. Noting it.'),
    (4, 1, 'a', '%1$s cooks for friends almost every Sunday and always wants more people at the table.'),
    (4, 2, 'b', 'That''s %2$s''s dream. They''d show up with a dish and opinions about it.'),
    (4, 3, 'a', 'Any dietary stuff I should know about?'),
    (4, 4, 'b', 'Nothing strict. They just get excited about %3$s.'),
    (4, 5, 'a', 'Then they''ll get along. Adding a note.'),
    (5, 1, 'a', '%1$s trains early most days and takes it seriously.'),
    (5, 2, 'b', '%2$s is similar, though they''d skip the bar after. Not into drinking.'),
    (5, 3, 'a', 'Neither is %1$s, so that works. Weekend sessions?'),
    (5, 4, 'b', 'Saturday mornings, yes. They like having people to push them on %3$s.'),
    (5, 5, 'a', 'Good. Strong match from my side.'),
    (6, 1, 'a', '%1$s reads constantly and loves a long conversation about big ideas.'),
    (6, 2, 'b', '%2$s too. They''d much rather a quiet evening than anything that runs late.'),
    (6, 3, 'a', 'Same for %1$s. Any topics %2$s loves?'),
    (6, 4, 'b', 'All sorts. They''d love a group that swaps notes on %3$s.'),
    (6, 5, 'a', 'That''s exactly what %1$s wants. Adding a note.'),
    (7, 1, 'a', '%1$s is out most Fridays: a long dinner first, then wherever the night goes.'),
    (7, 2, 'b', '%2$s too. They''re the last to leave any party.'),
    (7, 3, 'a', 'Would %2$s be up for a later start? %1$s rarely heads out before 10.'),
    (7, 4, 'b', 'Later is better honestly. They''re all about %3$s.'),
    (7, 5, 'a', 'Then they''ll have fun. Good match.'),
    (-1, 1, 'a', 'Hi, I''m here for %1$s. We don''t overlap much on paper, but I wanted to check.'),
    (-1, 2, 'b', 'Fair. %2$s is open to new things as long as the group is easygoing.'),
    (-1, 3, 'a', 'They do share some interest in %3$s.'),
    (-1, 4, 'b', 'True, though it''s not a big part of %2$s''s week.'),
    (-1, 5, 'a', 'Makes sense. Friendly, but probably not the same group.');

INSERT INTO pair_messages (pair_id, speaker_id, kind, content)
SELECT p.id, CASE WHEN c.speaker = 'a' THEN p.user_a ELSE p.user_b END, 'message',
       format(c.content, split_part(ua.full_name, ' ', 1), split_part(ub.full_name, ' ', 1), kw.name)
FROM pairs p
JOIN users ua ON ua.id = p.user_a
JOIN users ub ON ub.id = p.user_b
JOIN dev_user da ON da.user_id = p.user_a
JOIN dev_user db ON db.user_id = p.user_b
CROSS JOIN LATERAL (
    SELECT k.name FROM keyword_scores sa
    JOIN keyword_scores sb ON sb.keyword_id = sa.keyword_id AND sb.user_id = p.user_b
    JOIN keywords k ON k.id = sa.keyword_id
    WHERE sa.user_id = p.user_a
    ORDER BY sa.score * sb.score DESC LIMIT 1
) kw
JOIN dev_chat c ON c.cluster = CASE WHEN da.cluster = db.cluster THEN da.cluster ELSE -1 END
WHERE p.universe_id = '00000000-0000-0000-0000-000000000001'
ORDER BY p.id, c.turn;

-- One group per cluster.
INSERT INTO groups (id, universe_id, group_score, rationale, plans_status)
SELECT md5('dev-group-' || cluster)::uuid, '00000000-0000-0000-0000-000000000001', 8, 'dev seed: everyone shares the same core interests', 'none'
FROM (SELECT DISTINCT cluster FROM dev_user) c;

INSERT INTO group_members (group_id, user_id)
SELECT md5('dev-group-' || cluster)::uuid, user_id FROM dev_user;

UPDATE universes SET status = 'matched' WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;
