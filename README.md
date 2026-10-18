# unif.ai

**Your AI agent meets everyone first, so you don't have to start cold.**

unif.ai sorts a pool of people (a hackathon, a club, a friend-of-friends circle) into small friend groups of 3 to 8.
Each person gets an AI agent that knows them. The agents talk to each other, a judge reads the conversations, and
people end up with a group that fits, plus a few plans they can actually do together.

Built for LA Hacks.

![The unif.ai world: a small isometric town where agents walk between rooms, with a bio card open](docs/img/world.png)

*The World: every agent is a character in a town grown from the interests of the people in it.*

## How it works

From an invite link to a group with a plan, with the tech behind each step. Everything is stored in PostgreSQL,
and the World shows it live.

```mermaid
flowchart TB
    subgraph S1["1 · Join"]
        direction LR
        A["Invite link"] --> B["Interview<br/>iMessage (Photon) · ASI:One (Fetch.ai uAgents)<br/>or the web app (Next.js)"]
        B --> C["Your agent<br/>TypeScript bot · Gemini<br/>public + private profile"]
    end

    subgraph S2["2 · Find themes"]
        direction LR
        D["Keywords<br/>Gemini reads every interview"] --> E["Scores<br/>Jev (TypeSafe) rates each person<br/>on each keyword"]
    end

    subgraph S3["3 · Meet"]
        direction LR
        F{"Compatible?<br/>dealbreakers · free time<br/>similarity · OR-Tools"} -->|yes| G["Agents chat<br/>Gemini or OpenRouter<br/>pair by pair"]
        G --> H["Judge<br/>Jev: chemistry · logistics"]
        F -->|no| X["Skipped"]
    end

    subgraph S4["4 · Group"]
        direction LR
        I["Groups of 3–8<br/>OR-Tools CP-SAT"] --> J["Group review<br/>Gemini"]
    end

    subgraph S5["5 · Plan"]
        direction LR
        K["Ideas fitted to free time<br/>Browser Use · Ticketmaster"] --> L{"Majority<br/>'i'm in'?"}
        L -->|yes| M["Plan locks<br/>text via Photon"]
        L -->|not yet| K
    end

    S1 --> S2 --> S3 --> S4 --> S5

    DB[("PostgreSQL + pgvector<br/>profiles · scores · chats · groups")]
    API["FastAPI<br/>Python"]
    W(["The World<br/>PixiJS · live view of every step"])

    S1 -.-> DB
    S2 -.-> DB
    S3 -.-> DB
    S4 -.-> DB
    S5 -.-> DB
    DB <--> API --> W
```

## The World

The most visible part: a living map of a universe. It is **generated from the keywords actually present in the
people**, not from a fixed floor plan.

- A crowd that shares *baking* gets a bakery. *Cocktails* gets a bar, *chess* a chess club, *hiking* a trailhead,
  *poetry* a reading nook. 19 kinds of building, many with variants.
- The layout is seeded by the universe and its keywords, so the same community always grows the same town, and
  new people never move the furniture.
- Agents wander their own spaces, walk to meet when a chat starts, and gather at a table when their group forms.
- You can pan, zoom, follow your own character, click anyone for a bio card, and read the conversations.

Everything you see comes from real data. A chat is shown as *live* only while the conversation is truly running,
and replays are always labelled as replays.

## Small things we like

- **Agent looks are customisable.** Each character's hair, skin tone and clothes come from what
  the person said about themselves, nothing else. If they didn't say, the agent doesn't invent it, and you can
  change your look any time.
- **Private stays private.** Dealbreakers and values shape who your agent talks to but are never repeated to
  other agents or shown to other people. The shared World hides scores and verdicts.
- **Two kinds of model, each doing what it's good at.** One writes (interviews, conversations, keywords). The other
  answers typed questions with calibrated probabilities (scores, dealbreakers, chemistry). Math stays in code.
- **Cost-bounded by design.** Only likely pairs ever chat, so the number of conversations grows with the number of
  people, not with the number of possible pairs.

## Try it

You need Docker, Python 3.11 to 3.14 with [uv](https://docs.astral.sh/uv/), and Node 20+.

```bash
docker compose -f db/docker-compose.yml up -d          # database

cd server && cp .env.example .env                      # add a model key
uv sync && uv run uvicorn app.main:app --reload        # API on :8000
uv run python -m scripts.seed_demo                     # a ready-made demo universe (no model calls)

cd ../client && npm install && npm run dev             # web app on :3001
```

Open the admin at <http://localhost:3001/admin?mode=demo> and pick the demo universe. Full setup, the environment
variables, Windows notes and Docker are in the [developer guide](docs/DEVELOPMENT.md).

## What's inside

| Part | What it is |
| ---- | ---------- |
| `client/` | Next.js and React web app: participant pages, join flow, admin console, the PixiJS World |
| `server/` | FastAPI and Postgres: matching pipeline, grouping solver, plans, API |
| `agent/` | Python library for the agents: interviewer, conversations, judge, profiles |
| `onboarding/`, `asi-agent/` | Chat onboarding bot (iMessage and HTTP) and its ASI:One relay |
| `db/` | Schema, migrations and demo seeds |

Built with Next.js, React, Tailwind, PixiJS and three.js on the front; FastAPI, PostgreSQL and OR-Tools CP-SAT on
the back; Gemini and TypeSafe's Jev for the models.

## Status

A working prototype from a hackathon: the full path from invite to groups to plans runs end to end on seeded
and synthetic data. It is not hardened for production use, and sign-in, consent and data-deletion flows are still
to come. The developer guide has a component-by-component status table.

## More

- [Developer guide](docs/DEVELOPMENT.md): setup, configuration, API, database, tests, status
- [Local setup walkthrough](RUNNING.md)
- [Task board](PROGRESS.md) and [notes for AI coding agents](AGENTS.md)
