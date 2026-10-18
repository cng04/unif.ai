-- Fake plans for the seeded demo universe: 3 events per group, so the group screens ("pick a plan") and the you tab
-- have something to show without running Browser Use or Ticketmaster. Run by hand after dev_graph_seed.sql (or a real
-- matching run); safe to re-run. Only fills groups that have no events yet, so real plans are never overwritten.
--   docker exec -i unifai-db psql -U unifai -d unifai < db/dev_events_seed.sql
-- Venues are invented and urls are empty on purpose: nothing here should look like a real listing.

BEGIN;

-- 3 plans per theme, keyed by one of dev_graph_seed.sql's keywords. '' is the fallback for groups with no match.
CREATE TEMP TABLE dev_plan (keyword TEXT, rank INT, name TEXT, venue TEXT, day_offset INT, hour INT, price TEXT)
    ON COMMIT DROP;
INSERT INTO dev_plan VALUES
    ('hiking', 1, 'sunrise ridge hike', 'canyon trailhead', 5, 8, 'free'),
    ('hiking', 2, 'guided wildlife walk', 'nature reserve visitor center', 6, 10, '$'),
    ('hiking', 3, 'tide pool morning', 'north beach parking lot', 12, 9, 'free'),
    ('board games', 1, 'board game cafe night', 'the dice room', 3, 19, '$'),
    ('board games', 2, 'retro arcade tournament', 'pixel hall', 5, 20, '$$'),
    ('board games', 3, 'co-op strategy afternoon', 'corner table games', 6, 14, '$'),
    ('painting', 1, 'open studio painting session', 'eastside art collective', 4, 18, '$$'),
    ('painting', 2, 'late museum night', 'city museum of art', 3, 19, '$$'),
    ('painting', 3, 'gallery walk', 'arts district', 5, 16, 'free'),
    ('live music', 1, 'small venue indie show', 'the back room', 4, 21, '$$'),
    ('live music', 2, 'songwriter open mic', 'harbor coffee house', 2, 20, 'free'),
    ('live music', 3, 'jazz in the park', 'park bandshell', 6, 17, 'free'),
    ('cooking', 1, 'pasta from scratch class', 'community kitchen', 4, 18, '$$'),
    ('cooking', 2, 'night market food crawl', 'downtown night market', 5, 19, '$'),
    ('cooking', 3, 'potluck supper club', 'shared rooftop', 6, 18, 'free'),
    ('training', 1, 'bouldering meetup', 'granite climbing gym', 2, 19, '$$'),
    ('training', 2, 'saturday run club 5k', 'boardwalk start line', 5, 8, 'free'),
    ('training', 3, 'pickup volleyball', 'south beach courts', 6, 11, 'free'),
    ('reading', 1, 'silent book club', 'lantern bookshop', 2, 19, 'free'),
    ('reading', 2, 'science pub talk', 'the lab taproom', 3, 19, '$'),
    ('reading', 3, 'planetarium show', 'observatory', 5, 20, '$'),
    ('late nights', 1, 'cocktail bar trivia', 'the copper still', 3, 21, '$$'),
    ('late nights', 2, 'rooftop dj night', 'skyline rooftop', 5, 22, '$$'),
    ('late nights', 3, 'late-night karaoke', 'neon box karaoke', 4, 22, '$'),
    ('', 1, 'picnic in the park', 'central park lawn', 5, 12, 'free'),
    ('', 2, 'trivia night', 'the corner pub', 3, 20, '$'),
    ('', 3, 'farmers market and brunch', 'saturday market', 5, 10, '$');

-- Groups in the demo universe that have no plans yet.
CREATE TEMP TABLE dev_group ON COMMIT DROP AS
SELECT g.id AS group_id, (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS size
FROM groups g
WHERE g.universe_id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.group_id = g.id);

-- Each group's theme: the catalog keyword its members score highest on, and how many of them are into it.
CREATE TEMP TABLE dev_theme ON COMMIT DROP AS
SELECT DISTINCT ON (dg.group_id)
       dg.group_id, dg.size, k.name AS keyword, count(*) FILTER (WHERE ks.score > 0.5) AS fans
FROM dev_group dg
JOIN group_members gm ON gm.group_id = dg.group_id
JOIN keyword_scores ks ON ks.user_id = gm.user_id
JOIN keywords k ON k.id = ks.keyword_id
WHERE k.name IN (SELECT keyword FROM dev_plan)
GROUP BY dg.group_id, dg.size, k.name
ORDER BY dg.group_id, avg(ks.score) DESC;

-- Groups whose members have no catalog keyword get the fallback plans.
INSERT INTO dev_theme
SELECT group_id, size, '', 0 FROM dev_group WHERE group_id NOT IN (SELECT group_id FROM dev_theme);

-- Start times are days from next Monday, in LA time, so every plan is upcoming on the day you seed.
INSERT INTO events (group_id, source, name, venue, starts_at, time_label, price, reason, rank)
SELECT t.group_id, 'dev seed', p.name, p.venue, s.at,
       lower(to_char(s.at AT TIME ZONE 'America/Los_Angeles', 'Dy DD')) || ' · '
           || to_char(s.at AT TIME ZONE 'America/Los_Angeles', 'HH24:MI'),
       p.price,
       CASE WHEN t.fans = t.size THEN 'all ' || t.size || ' of you are into ' || t.keyword || '.'
            WHEN t.fans > 0 THEN t.fans || ' of ' || t.size || ' of you are into ' || t.keyword || '.'
            ELSE 'an easy first plan for the whole group.' END,
       p.rank
FROM dev_theme t
JOIN dev_plan p ON p.keyword = t.keyword
CROSS JOIN LATERAL (
    SELECT (date_trunc('week', now() AT TIME ZONE 'America/Los_Angeles')
            + make_interval(days => 7) + make_interval(days => p.day_offset, hours => p.hour)) AT TIME ZONE 'America/Los_Angeles' AS at
) s;

UPDATE groups g
SET plans_status = 'ready',
    plans_summary = CASE WHEN t.keyword = '' THEN 'A few easy plans for your first meetup.'
                         ELSE 'Plans built around ' || t.keyword || ', since most of you are into it.' END
FROM dev_theme t
WHERE g.id = t.group_id;

COMMIT;
