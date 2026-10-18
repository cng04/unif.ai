"""Tools available to a persona agent during an agent-to-agent conversation.

The agent speaks only through send_message; any other text it produces stays private. Its whole profile is
already in the system prompt, so there are no lookup tools: every turn is one model call.
"""

TOOL_DECLARATIONS: list[dict] = [
    {
        "name": "send_message",
        "description": "Send a message to the other agent. This is the only way to speak to them.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "text": {"type": "STRING", "description": "What the other agent sees."},
                "note": {
                    "type": "STRING",
                    "description": "Optional private evidence about compatibility. Only the judge reads it.",
                },
            },
            "required": ["text"],
        },
    },
]
