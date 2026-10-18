-- A small 15-person demo universe using public figures who are not in the two 40-person seeds.
-- These are fictional matching-agent sketches inspired by public work/personas, not factual claims about
-- anyone's private life, availability, location, values, or relationships. Safe to re-run locally.
BEGIN;

DELETE FROM universes WHERE id = '20000000-0000-0000-0000-000000000001';
INSERT INTO universes (id, name, admin_email, invite_code)
VALUES ('20000000-0000-0000-0000-000000000001', '15-person Celebrity Sprint', 'sprint@unif.ai', 'celeb15');

CREATE TEMP TABLE sprint_people (
    seq INT PRIMARY KEY,
    name TEXT NOT NULL,
    profession TEXT NOT NULL,
    cluster TEXT NOT NULL,
    interests TEXT[] NOT NULL,
    vibe TEXT NOT NULL,
    weekend TEXT NOT NULL,
    nogo TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO sprint_people VALUES
    (1, 'Adam Savage', 'maker and television host known for MythBusters and Tested', 'creative',
     ARRAY['making','special effects','tools','science communication'], 'curious, energetic, detail-obsessed',
     'Building a prop with friends, testing it too hard, and documenting what broke.',
     'Mocking unfinished experiments or people who are still learning.'),
    (2, 'Hayao Miyazaki', 'animator and filmmaker who co-founded Studio Ghibli', 'creative',
     ARRAY['animation','drawing','aviation','nature'], 'imaginative, exacting, contemplative',
     'Sketching outside, studying how things move, and watching a carefully made film.',
     'Treating craft or nature as disposable.'),
    (3, 'Lin-Manuel Miranda', 'composer, lyricist, and performer known for Hamilton and In the Heights', 'creative',
     ARRAY['musical theater','songwriting','history','improvisation'], 'verbal, collaborative, relentlessly enthusiastic',
     'Trading song ideas, seeing a show, and turning an ordinary conversation into a rhyme.',
     'Refusing collaboration or curiosity about someone else''s story.'),
    (4, 'Quinta Brunson', 'writer, comedian, actor, and creator of Abbott Elementary', 'creative',
     ARRAY['comedy writing','television','education','storytelling'], 'quick, grounded, observant',
     'Workshopping jokes, watching a sharp sitcom, and having dinner with people who notice the room.',
     'Punching down and calling it comedy.'),
    (5, 'Yo-Yo Ma', 'cellist known for classical performance and cross-cultural collaborations', 'creative',
     ARRAY['cello','classical music','collaboration','cultural exchange'], 'warm, attentive, quietly adventurous',
     'Rehearsing with musicians from different traditions and sharing a long meal afterward.',
     'Ego that leaves no room for listening.'),

    (6, 'Chris Hemsworth', 'actor known for Thor and action-adventure films', 'active',
     ARRAY['fitness','surfing','outdoor training','film'], 'upbeat, physical, playful',
     'An early workout, surfing, and a relaxed barbecue with a competitive game.',
     'Recklessness disguised as confidence.'),
    (7, 'Lewis Hamilton', 'Formula One driver and multiple-time world champion', 'active',
     ARRAY['motorsport','fashion','music','environmental advocacy'], 'focused, expressive, ambitious',
     'Training, working on a creative project, and finding somewhere with great design and music.',
     'Carelessness about safety or respect for the team.'),
    (8, 'Megan Rapinoe', 'footballer, World Cup champion, and equality advocate', 'active',
     ARRAY['football','team sports','fashion','social advocacy'], 'direct, competitive, outspoken',
     'A hard game, a loud dinner, and a conversation where people say what they mean.',
     'Standing by when a teammate is being targeted.'),
    (9, 'Michelle Obama', 'author and former First Lady of the United States', 'active',
     ARRAY['education','fitness','gardening','community service'], 'disciplined, warm, pragmatic',
     'A workout, time in a garden, and helping organize something useful for a community.',
     'Disrespect toward children or service workers.'),
    (10, 'Emma Watson', 'actor and advocate known for the Harry Potter films and education work', 'active',
     ARRAY['literature','acting','sustainable fashion','education'], 'thoughtful, composed, purposeful',
     'A bookshop, a long walk, and a small dinner that turns into a serious conversation.',
     'Dismissiveness toward education or equality.'),

    (11, 'Tim Berners-Lee', 'computer scientist who invented the World Wide Web', 'builders',
     ARRAY['open web','software','digital rights','information systems'], 'idealistic, technical, understated',
     'Prototyping an open tool and debating how technology can serve more people.',
     'Treating access to information as something only the powerful deserve.'),
    (12, 'Steve Wozniak', 'engineer and Apple co-founder known for early personal computers', 'builders',
     ARRAY['electronics','computers','engineering','pranks'], 'playful, generous, deeply technical',
     'Taking apart old hardware, building something elegant, and sneaking in a harmless prank.',
     'Status-seeking without curiosity about how anything works.'),
    (13, 'Mark Rober', 'engineer and video creator known for science and engineering projects', 'builders',
     ARRAY['engineering','science videos','education','creative experiments'], 'enthusiastic, methodical, accessible',
     'Building a ridiculous experiment, collecting real data, and making the explanation fun.',
     'Faking results because the honest experiment was less dramatic.'),
    (14, 'Mae Jemison', 'engineer, physician, and former NASA astronaut', 'builders',
     ARRAY['spaceflight','medicine','engineering','dance'], 'calm, interdisciplinary, determined',
     'A science museum, a dance performance, and a conversation connecting fields people keep separate.',
     'Telling people they must choose between technical and creative interests.'),
    (15, 'Demis Hassabis', 'computer scientist and co-founder of Google DeepMind', 'builders',
     ARRAY['artificial intelligence','games','neuroscience','scientific discovery'], 'analytical, ambitious, systems-minded',
     'A strategy game, a research discussion, and mapping a difficult problem into smaller experiments.',
     'Certainty that ignores evidence or safety concerns.');

INSERT INTO users (id, universe_id, full_name, email)
SELECT
    ('20000000-0000-0000-0000-' || lpad(to_hex(seq), 12, '0'))::uuid,
    '20000000-0000-0000-0000-000000000001',
    name,
    'sprint-' || seq || '@example.com'
FROM sprint_people;

INSERT INTO agent_profiles (user_id, public, private)
SELECT
    ('20000000-0000-0000-0000-' || lpad(to_hex(seq), 12, '0'))::uuid,
    jsonb_build_object(
        'name', name,
        'intro', name || ' — ' || profession || '.',
        'interests', to_jsonb(interests),
        'vibe', vibe,
        'humor', CASE cluster
            WHEN 'creative' THEN 'observational, playful, and specific'
            WHEN 'active' THEN 'competitive banter without taking it personally'
            ELSE 'dry, curious, and delighted by clever solutions'
        END,
        'group_role', CASE cluster
            WHEN 'creative' THEN 'the creative catalyst'
            WHEN 'active' THEN 'the one who gets everyone moving'
            ELSE 'the builder who turns ideas into experiments'
        END,
        'looking_for', 'people who genuinely enjoy ' || array_to_string(interests[1:2], ' and ')
    ),
    jsonb_build_object(
        'dealbreakers', jsonb_build_array(nogo),
        'values', to_jsonb(CASE cluster
            WHEN 'creative' THEN ARRAY['craft','collaboration']
            WHEN 'active' THEN ARRAY['effort','respect']
            ELSE ARRAY['curiosity','evidence']
        END),
        'energy', CASE WHEN seq % 3 = 0 THEN 'high-energy extrovert'
                       WHEN seq % 3 = 1 THEN 'social in small groups'
                       ELSE 'adaptable ambivert' END,
        'logistics', jsonb_build_object(
            'area', (ARRAY['Los Feliz','Silver Lake','Culver City','Santa Monica','Pasadena'])[1 + ((seq - 1) % 5)],
            'travel', 'up to 30 minutes for a worthwhile plan',
            'budget', (ARRAY['$','$$','$$$'])[1 + ((seq - 1) % 3)],
            'free', to_jsonb(CASE WHEN seq % 2 = 0 THEN ARRAY['weeknight evenings','weekend daytime']
                                  ELSE ARRAY['weekend daytime','weekend evenings'] END)
        ),
        'enjoyment_definition', 'Shared effort, specific conversation, and people who listen as well as they speak.'
    )
FROM sprint_people;

INSERT INTO onboarding_messages (user_id, role, content)
SELECT
    ('20000000-0000-0000-0000-' || lpad(to_hex(p.seq), 12, '0'))::uuid,
    m.role,
    m.content
FROM sprint_people p
CROSS JOIN LATERAL (VALUES
    (1, 'assistant', 'What does a perfect weekend look like for you?'),
    (2, 'user', p.weekend),
    (3, 'assistant', 'Is there anything that would make a group a no-go for you?'),
    (4, 'user', p.nogo)
) AS m(ord, role, content)
ORDER BY p.seq, m.ord;

\if :{?dry_run}
ROLLBACK;
\else
COMMIT;
\endif
