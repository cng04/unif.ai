# unif.ai iMessage bot

The unif.ai iMessage bot. Today it runs onboarding for the agent-to-agent friend matching project, built on [Photon 2.0](https://photon.codes/docs/beta/index). Incoming messages arrive over Photon's Socket.IO event stream, and replies go out through the `@photon-ai/api` REST client.

## Flow

1. **Name**: the bot greets the user and asks for their full name.
2. **Accounts**: asks which accounts to pull from. For people who signed up on the join page, any links or handles they send go to the server (`POST /users/{id}/social-links`). The server stores them and scrapes the public ones with Browser Use Cloud (whenever it has `BROWSER_USE_API_KEY`); the bot waits briefly for results before the interview. Scraped summaries reach the interviewer as data.
3. **AI prompt**: sends the onboarding prompt as its own bubble so it's easy to copy. The user pastes their AI's reply back, or texts `skip`.
   - Only the JSON object is extracted, validated with zod, and stripped of unknown keys. The raw paste is discarded and never reaches a model.
   - Points marked `[inferred]` or `unknown` become follow-up topics for the interview.
4. **Interview**: about 10 minutes of open-ended chat with Claude.
   - Always asks "what makes you enjoy someone's company?"
   - Covers logistics and possible dealbreakers.
   - Gets a wrap-up nudge at 10 turns and a hard stop at 14.
   - Ends with a `submit_profile` tool call using a strict schema.
5. **Review**: shows a summary. The user replies "looks good" or describes edits in their own words.
6. **Dealbreakers**: lists them explicitly and requires the user to reply `confirm` (or `none`) before anything is saved.

Text `restart` at any point to start over.

## Output

- `data/profiles/<id>.json` holds the `public` and `private` fields, source-tagged facts, `enjoyment_definition`, the accounts, the validated import, and the full onboarding transcript.
- `data/sessions/<id>.json` holds in-progress state, so a restart resumes mid-conversation.
- `data/photon-cursor.json` holds the last event handled. After a crash, the bot replays from there. Each reply is sent with an idempotency key, so a replay doesn't text the user twice.

## Shared-line assignments

A shared iMessage line only talks to people who have been **assigned** to it, and the user has to text first. Every new user needs an assignment:

```bash
npm run assign -- +14155550123 Cyn Lee   # prints the number they should text
```

In production, call that from your sign-up page after collecting the user's phone number. A dedicated line (Business plan) avoids this step.

## Run

```bash
npm install
cp .env.example .env            # add ANTHROPIC_API_KEY (+ PHOTON_API_KEY for iMessage)
npm run dev                     # chat in the terminal, no Photon account needed
npm run assign -- <your phone>   # assign yourself to the shared line
npm start                       # live on iMessage via Photon 2.0
npm test                        # paste-parsing tests
```
