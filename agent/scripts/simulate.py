"""Run one agent-to-agent conversation between two sample personas and print the judge's verdict.

Usage: GEMINI_API_KEY=... TYPESAFE_API_KEY=... uv run python scripts/simulate.py
   or: GEMINI_API_KEY=... OPENROUTER_API_KEY=... uv run python scripts/simulate.py
"""

import os

from unifai_agent import AgentProfile, GeminiLLM, Judge, OpenRouterJev, PersonaAgent, jev_client, run_conversation

CYNTHIA = AgentProfile.model_validate({
    "user_id": "cynthia",
    "public": {
        "name": "Cynthia",
        "interests": ["climbing", "indie games", "ramen"],
        "vibe": "dry humor, curious, low-key",
        "looking_for": "a small crew for weekend adventures",
    },
    "private": {
        "dealbreakers": ["heavy drinking culture", "flaky plans"],
        "values": ["reliability", "curiosity"],
        "energy": "introvert, prefers groups under 6",
        "logistics": {"area": "SF Mission", "budget": "$", "free": ["weeknights", "Sun"]},
    },
})

MARCO = AgentProfile.model_validate({
    "user_id": "marco",
    "public": {
        "name": "Marco",
        "interests": ["bar crawls", "EDM festivals", "fantasy football"],
        "vibe": "loud, spontaneous, always down",
        "looking_for": "people to go out with every weekend",
    },
    "private": {
        "dealbreakers": ["people who cancel for being tired"],
        "values": ["spontaneity", "loyalty"],
        "energy": "extrovert, the bigger the group the better",
        "logistics": {"area": "SF Marina", "budget": "$$$", "free": ["Fri", "Sat"]},
    },
})


def main() -> None:
    llm = GeminiLLM()
    transcript = run_conversation(PersonaAgent(CYNTHIA, llm), PersonaAgent(MARCO, llm))
    print(transcript.render({"cynthia": "Cynthia", "marco": "Marco"}))
    print("\nnotes:", transcript.notes)
    print("\nverdict:", Judge(llm, OpenRouterJev() if os.environ.get("OPENROUTER_API_KEY") else jev_client()).evaluate(CYNTHIA, MARCO, transcript).model_dump_json(indent=2))


if __name__ == "__main__":
    main()
