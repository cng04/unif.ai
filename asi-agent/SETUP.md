# ASI:One agent: setup

`README.md` is published as the agent's public description on Agentverse, so setup notes live here.

## How it fits

```
ASI:One user ──chat──▶ Agentverse mailbox ──▶ agent.py (this folder)
                                                 │ POST /message
                                                 ▼
                              onboarding/ bot, CHANNELS=http (same onboarding flow)
                                                 │
                                                 ▼
                                   Postgres: users, agent_profiles, onboarding_messages
```

Each ASI:One user is identified by their agent address, stored as session `asi:<address>`. They have no phone number, so their `users.phone` is empty and they join `DEFAULT_UNIVERSE_ID`.

## Run it

1. Start the bot with the HTTP channel. Keep iMessage running too if you want both:
   ```bash
   cd ../imessage
   CHANNELS=photon,http npm start      # or CHANNELS=http for ASI:One only
   ```
2. Start the agent:
   ```bash
   cd ../asi-agent
   uv run --env-file .env agent.py
   ```
   It prints the agent's address and an **Agent inspector** link.
3. Open the inspector link, click **Connect**, choose **Mailbox**, and sign in to Agentverse. The terminal should then say `Successfully registered as mailbox agent in Agentverse`.
4. In the inspector, open **Agent Profile** to set the display name, handle and avatar on Agentverse.
5. Click **Chat with Agent** to open it in ASI:One and say hi.

Both processes must stay running for people to chat. `AGENT_SEED` in `.env` fixes the agent's address, so keep it stable and secret.
