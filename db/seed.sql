INSERT INTO universes (id, name, admin_email, invite_code)
VALUES ('00000000-0000-0000-0000-000000000001', 'LA Hacks Demo', 'admin@unif.ai', 'lahacks');

INSERT INTO users (id, universe_id, full_name)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'Cynthia');

INSERT INTO agent_profiles (user_id, public, private)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    '{"name": "Cynthia", "interests": ["climbing", "indie games", "ramen"],
      "vibe": "dry humor, curious, low-key",
      "looking_for": "a small crew for weekend adventures"}',
    '{"dealbreakers": ["heavy drinking culture", "flaky plans"],
      "values": ["reliability", "curiosity"],
      "energy": "introvert, prefers groups under 6",
      "logistics": {"area": "SF Mission", "budget": "$", "free": ["weeknights", "Sun"]}}'
);
