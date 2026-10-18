-- A second 40-person demo universe using different real public figures.
-- These are fictional matching-agent sketches inspired by public work/personas, not factual claims about
-- anyone's private life, availability, location, values, or relationships. Safe to re-run locally.
BEGIN;

DELETE FROM universes WHERE id = '10000000-0000-0000-0000-000000000001';
INSERT INTO universes (id, name, admin_email, invite_code)
VALUES ('10000000-0000-0000-0000-000000000001', '40-person Celebrity Encore', 'encore@unif.ai', 'encore40');

CREATE TEMP TABLE encore_people (
    seq INT PRIMARY KEY,
    name TEXT NOT NULL,
    profession TEXT NOT NULL,
    cluster TEXT NOT NULL,
    interests TEXT[] NOT NULL,
    vibe TEXT NOT NULL,
    weekend TEXT NOT NULL,
    nogo TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO encore_people VALUES
    (1, 'Bear Grylls', 'adventurer and television presenter known for survival programs', 'outdoors',
     ARRAY['survival skills','climbing','camping','expeditions'], 'fearless, energetic, encouraging',
     'A dawn hike that turns into an unplanned overnight camp and a story worth retelling.',
     'People who refuse every challenge before trying it.'),
    (2, 'David Attenborough', 'broadcaster and natural historian known for landmark wildlife documentaries', 'outdoors',
     ARRAY['wildlife','conservation','documentaries','natural history'], 'gentle, observant, quietly intense',
     'A patient morning watching wildlife, followed by tea and an absorbing conversation.',
     'Cruelty toward animals or treating nature as disposable.'),
    (3, 'Greta Thunberg', 'climate activist who began the Fridays for Future school strikes', 'outdoors',
     ARRAY['climate action','sailing','science communication','activism'], 'direct, focused, uncompromising',
     'A climate action event, a long walk, and practical planning with people who follow through.',
     'Performative concern without any willingness to act.'),
    (4, 'Jason Momoa', 'actor known for Aquaman, Dune, and outdoor advocacy', 'outdoors',
     ARRAY['rock climbing','surfing','motorcycles','ocean conservation'], 'boisterous, warm, adventurous',
     'Climbing or surfing all day, then cooking outdoors with a loud, close-knit crew.',
     'Disrespect for the ocean or people who mock enthusiasm.'),
    (5, 'Yvon Chouinard', 'climber, environmentalist, and founder of Patagonia', 'outdoors',
     ARRAY['climbing','surfing','fly fishing','environmentalism'], 'minimalist, practical, stubborn',
     'An uncrowded climbing day with simple food and no unnecessary gear.',
     'Wastefulness and status-seeking for its own sake.'),

    (6, 'Marques Brownlee', 'technology video creator known for long-form product reviews', 'tech',
     ARRAY['consumer technology','cameras','ultimate frisbee','electric vehicles'], 'measured, curious, precise',
     'Testing a new camera, playing ultimate, and comparing notes without turning it into hype.',
     'Confident opinions from people who did not test the thing.'),
    (7, 'Simone Giertz', 'inventor and creator known for playful robotics projects', 'tech',
     ARRAY['robotics','making','design','comedy'], 'inventive, irreverent, cheerfully chaotic',
     'Building an unnecessary machine with friends and laughing when version one catches fire.',
     'People who treat failed experiments as embarrassing.'),
    (8, 'Hideo Kojima', 'video game designer known for Metal Gear and Death Stranding', 'tech',
     ARRAY['video games','cinema','science fiction','music'], 'intense, cinematic, delightfully cryptic',
     'A double feature, a long game session, and a midnight argument about storytelling.',
     'Dismissiveness toward games or films as serious art.'),
    (9, 'Shigeru Miyamoto', 'video game designer associated with Mario, Zelda, and Pikmin', 'tech',
     ARRAY['game design','gardening','music','exploration'], 'playful, thoughtful, detail-oriented',
     'A bike ride, gardening, then prototyping a game idea simple enough to explain in one sentence.',
     'Complexity added only to impress people.'),
    (10, 'Gabe Newell', 'co-founder of Valve and a major figure in PC gaming', 'tech',
     ARRAY['PC gaming','software','virtual reality','sailing'], 'dry, technical, unconventional',
     'A cooperative game marathon followed by an overly detailed conversation about systems.',
     'Closed platforms and meetings that should have been an email.'),

    (11, 'Zendaya', 'actor and singer known for Euphoria, Dune, and the Spider-Man films', 'film',
     ARRAY['acting','fashion','dance','basketball'], 'composed, witty, quietly competitive',
     'A creative rehearsal, good food, and a low-key night with people who do not need attention.',
     'Condescension or turning every room into a competition for status.'),
    (12, 'Pedro Pascal', 'actor known for The Last of Us, The Mandalorian, and Narcos', 'film',
     ARRAY['acting','theater','movies','storytelling'], 'affectionate, funny, expressive',
     'A matinee, a long dinner, and swapping stories until everyone is doing impressions.',
     'Cruel humor aimed at someone who cannot push back.'),
    (13, 'Margot Robbie', 'actor and producer known for Barbie and I, Tonya', 'film',
     ARRAY['film production','acting','ice hockey','travel'], 'energetic, collaborative, ambitious',
     'Watching a bold film, workshopping ideas, then doing something active outside.',
     'People who take credit without doing the work.'),
    (14, 'Jordan Peele', 'filmmaker and comedian known for Get Out, Nope, and Key & Peele', 'film',
     ARRAY['horror films','comedy','social satire','screenwriting'], 'analytical, mischievous, observant',
     'A horror marathon followed by an argument about what every unsettling detail meant.',
     'People who refuse to examine why a joke or story lands badly.'),
    (15, 'Bong Joon-ho', 'filmmaker known for Parasite, Snowpiercer, and Memories of Murder', 'film',
     ARRAY['cinema','storyboarding','social satire','food'], 'wry, meticulous, genre-bending',
     'A repertory cinema visit and a late meal discussing class, structure, and strange tonal turns.',
     'Snobbery about genre or subtitles.'),

    (16, 'Beyoncé', 'singer, songwriter, and performer known for a highly disciplined live show', 'music',
     ARRAY['music','dance','visual albums','performance'], 'focused, commanding, exacting',
     'A dance rehearsal, visual planning, and celebrating only after everyone has delivered.',
     'Chronic lateness or expecting excellence without preparation.'),
    (17, 'Kendrick Lamar', 'rapper and songwriter known for narrative, socially engaged albums', 'music',
     ARRAY['hip-hop','writing','basketball','storytelling'], 'reflective, incisive, private',
     'Writing, a pickup basketball game, and a small conversation that goes deeper than small talk.',
     'Performative authenticity and people who never listen.'),
    (18, 'Billie Eilish', 'singer and songwriter known for genre-blurring pop made with close collaboration', 'music',
     ARRAY['songwriting','visual art','fashion','animals'], 'deadpan, candid, unconventional',
     'Making something strange in a home studio, then watching unsettling videos with friends.',
     'Forced positivity or being told to make art more normal.'),
    (19, 'Bad Bunny', 'Puerto Rican rapper, singer, and performer', 'music',
     ARRAY['Latin music','wrestling','fashion','basketball'], 'bold, playful, independent',
     'Music all night, a basketball run, and an outfit nobody else would have chosen.',
     'People who disrespect Puerto Rican culture or police self-expression.'),
    (20, 'Harry Styles', 'singer and actor known for pop music and theatrical live performances', 'music',
     ARRAY['music','fashion','acting','live shows'], 'charming, eclectic, easygoing',
     'A record shop, a spontaneous drive, and a live show where everyone commits to the look.',
     'Rigid ideas about how people are supposed to dress or act.'),

    (21, 'José Andrés', 'chef and humanitarian who founded World Central Kitchen', 'food',
     ARRAY['cooking','humanitarian relief','travel','Spanish food'], 'urgent, generous, exuberant',
     'Cooking an enormous meal with friends and making sure nobody nearby goes unfed.',
     'Indifference when practical help is possible.'),
    (22, 'Nigella Lawson', 'food writer and television cook known for relaxed home cooking', 'food',
     ARRAY['home cooking','cookbooks','desserts','literature'], 'sensual, articulate, unhurried',
     'A bookstore visit followed by cooking something indulgent for a small dinner.',
     'Food moralizing or making guests anxious about eating.'),
    (23, 'David Chang', 'chef and founder of the Momofuku restaurant group', 'food',
     ARRAY['restaurants','noodles','food media','golf'], 'restless, blunt, experimental',
     'Trying several restaurants in one day and arguing honestly about what worked.',
     'Empty politeness when direct feedback would help.'),
    (24, 'Padma Lakshmi', 'author, producer, and television host associated with food and travel', 'food',
     ARRAY['global cuisine','travel','writing','food history'], 'curious, polished, forthright',
     'A market crawl, cooking with unfamiliar ingredients, and asking where every dish came from.',
     'Dismissing a culture while borrowing its food.'),
    (25, 'Guy Fieri', 'chef and television host known for Diners, Drive-Ins and Dives', 'food',
     ARRAY['road trips','diners','barbecue','cars'], 'loud, generous, relentlessly enthusiastic',
     'A road trip built around three family-run restaurants and zero subtle shirts.',
     'Food snobbery and being rude to service workers.'),

    (26, 'LeBron James', 'professional basketball player and four-time NBA champion', 'sports',
     ARRAY['basketball','training','family','education'], 'strategic, confident, team-focused',
     'Training early, watching film, then a competitive game night with the whole crew.',
     'Teammates who avoid accountability.'),
    (27, 'Simone Biles', 'gymnast and multiple-time Olympic and world champion', 'sports',
     ARRAY['gymnastics','training','dogs','mental wellness advocacy'], 'focused, candid, resilient',
     'A hard training session, time with dogs, and a calm dinner with trusted people.',
     'People who trivialize athletes'' wellbeing.'),
    (28, 'Lionel Messi', 'professional footballer and World Cup champion', 'sports',
     ARRAY['football','family','training','video games'], 'quiet, competitive, understated',
     'Football, family time, and a relaxed game session without a big scene.',
     'Showboating that comes at the expense of the team.'),
    (29, 'Naomi Osaka', 'tennis player, entrepreneur, and mental health advocate', 'sports',
     ARRAY['tennis','fashion','gaming','social advocacy'], 'thoughtful, reserved, quietly bold',
     'Training, gaming, and a small dinner where silence does not need filling.',
     'Pressure to perform a personality for other people.'),
    (30, 'Stephen Curry', 'professional basketball player known for long-range shooting', 'sports',
     ARRAY['basketball','golf','family','community work'], 'upbeat, disciplined, competitive',
     'Shooting practice, golf, and cooking with family or a few close friends.',
     'People who stop working once they receive praise.'),

    (31, 'Neil deGrasse Tyson', 'astrophysicist and science communicator', 'ideas',
     ARRAY['astrophysics','science communication','movies','cosmic questions'], 'animated, argumentative, explanatory',
     'A planetarium visit followed by correcting the physics in a science-fiction movie.',
     'Claims that cannot survive a basic evidence check.'),
    (32, 'Margaret Atwood', 'novelist and poet known for The Handmaid''s Tale and speculative fiction', 'ideas',
     ARRAY['writing','speculative fiction','birding','environmentalism'], 'dry, sharp, intellectually playful',
     'Birdwatching, writing, and a dinner where nobody confuses dystopia with prediction.',
     'Censorship and incuriosity about history.'),
    (33, 'Chimamanda Ngozi Adichie', 'novelist and essayist known for Americanah and Half of a Yellow Sun', 'ideas',
     ARRAY['literature','storytelling','fashion','feminism'], 'eloquent, warm, incisive',
     'Reading, dressing beautifully for dinner, and a conversation willing to challenge easy narratives.',
     'Reducing a person or culture to one simplistic story.'),
    (34, 'Brian Cox', 'physicist and television science presenter', 'ideas',
     ARRAY['particle physics','astronomy','music','science television'], 'enthusiastic, lyrical, patient',
     'Stargazing somewhere dark, then explaining why the view is even stranger than it looks.',
     'Cynicism presented as intelligence.'),
    (35, 'Jane McGonigal', 'game designer and researcher known for work on games and resilience', 'ideas',
     ARRAY['game design','future thinking','running','collaboration'], 'optimistic, systems-minded, energetic',
     'A cooperative game, a run, and designing a challenge that makes a real problem feel solvable.',
     'People who dismiss play as useless by default.'),

    (36, 'Conan O''Brien', 'comedian, writer, and late-night television host', 'comedy',
     ARRAY['comedy','travel','history','guitar'], 'self-deprecating, absurd, relentlessly verbal',
     'A historical site, bothering strangers with bits, and playing guitar badly after dinner.',
     'People who cannot tolerate being the joke occasionally.'),
    (37, 'Ali Wong', 'comedian, writer, and actor known for candid stand-up specials', 'comedy',
     ARRAY['stand-up comedy','writing','food','fashion'], 'blunt, energetic, confessional',
     'Writing jokes, eating extremely well, and saying the impolite observation everyone noticed.',
     'People who demand honesty and then punish it.'),
    (38, 'Trevor Noah', 'comedian, author, and former host of The Daily Show', 'comedy',
     ARRAY['comedy','languages','travel','politics'], 'curious, quick, cosmopolitan',
     'Trying a new restaurant with people from different places and trading stories across languages.',
     'Certainty without curiosity about anyone else''s experience.'),
    (39, 'RuPaul', 'drag performer, producer, and host of RuPaul''s Drag Race', 'comedy',
     ARRAY['drag','fashion','dance music','performance'], 'theatrical, direct, glamorous',
     'A transformation, a dance floor, and a long debrief about who actually brought presence.',
     'Taking yourself seriously while refusing to examine yourself.'),
    (40, 'John Mulaney', 'comedian and writer known for tightly structured observational stand-up', 'comedy',
     ARRAY['stand-up comedy','musical theater','writing','old movies'], 'polished, anxious, sharply observant',
     'Writing, an old movie, and turning a minor social mistake into a twenty-minute story.',
     'People who make chaos everyone else''s responsibility.');

INSERT INTO users (id, universe_id, full_name, email)
SELECT
    ('10000000-0000-0000-0000-' || lpad(to_hex(seq), 12, '0'))::uuid,
    '10000000-0000-0000-0000-000000000001',
    name,
    'encore-' || seq || '@example.com'
FROM encore_people;

INSERT INTO agent_profiles (user_id, public, private)
SELECT
    ('10000000-0000-0000-0000-' || lpad(to_hex(seq), 12, '0'))::uuid,
    jsonb_build_object(
        'name', name,
        'intro', name || ' — ' || profession || '.',
        'interests', to_jsonb(interests),
        'vibe', vibe,
        'humor', CASE cluster
            WHEN 'comedy' THEN 'fast, observational, willing to tease'
            WHEN 'tech' THEN 'dry, nerdy, detail-heavy'
            WHEN 'film' THEN 'story-driven and referential'
            WHEN 'food' THEN 'warm until someone insults the meal'
            ELSE 'specific to the moment'
        END,
        'group_role', CASE cluster
            WHEN 'outdoors' THEN 'the one who gets everyone outside'
            WHEN 'tech' THEN 'the tinkerer'
            WHEN 'film' THEN 'the storyteller'
            WHEN 'music' THEN 'the creative spark'
            WHEN 'food' THEN 'the host'
            WHEN 'sports' THEN 'the competitor'
            WHEN 'ideas' THEN 'the question-asker'
            ELSE 'the comic catalyst'
        END,
        'looking_for', 'people who genuinely enjoy ' || array_to_string(interests[1:2], ' and ')
    ),
    jsonb_build_object(
        'dealbreakers', jsonb_build_array(nogo),
        'values', to_jsonb(CASE cluster
            WHEN 'outdoors' THEN ARRAY['stewardship','courage']
            WHEN 'tech' THEN ARRAY['craft','experimentation']
            WHEN 'film' THEN ARRAY['collaboration','originality']
            WHEN 'music' THEN ARRAY['expression','discipline']
            WHEN 'food' THEN ARRAY['hospitality','curiosity']
            WHEN 'sports' THEN ARRAY['effort','teamwork']
            WHEN 'ideas' THEN ARRAY['evidence','curiosity']
            ELSE ARRAY['humor','honesty']
        END),
        'energy', CASE WHEN seq % 3 = 0 THEN 'high-energy extrovert'
                       WHEN seq % 3 = 1 THEN 'social in small groups'
                       ELSE 'adaptable ambivert' END,
        'logistics', jsonb_build_object(
            'area', (ARRAY['Los Feliz','Silver Lake','Culver City','Santa Monica','Pasadena','Venice','Echo Park','West Hollywood'])[1 + (seq % 8)],
            'travel', 'up to 30 minutes for a worthwhile plan',
            'budget', (ARRAY['$','$$','$$$'])[1 + (seq % 3)],
            'free', to_jsonb(CASE WHEN seq % 2 = 0 THEN ARRAY['weeknight evenings','weekend daytime']
                                  ELSE ARRAY['weekend daytime','weekend evenings'] END)
        ),
        'enjoyment_definition', 'Specific conversation, shared effort, and people who mean what they say.'
    )
FROM encore_people;

INSERT INTO onboarding_messages (user_id, role, content)
SELECT
    ('10000000-0000-0000-0000-' || lpad(to_hex(p.seq), 12, '0'))::uuid,
    m.role,
    m.content
FROM encore_people p
CROSS JOIN LATERAL (VALUES
    (1, 'assistant', 'What does a perfect weekend look like for you?'),
    (2, 'user', p.weekend),
    (3, 'assistant', 'Is there anything that would make a group a no-go for you?'),
    (4, 'user', p.nogo)
) AS m(ord, role, content)
ORDER BY p.seq, m.ord;

COMMIT;
