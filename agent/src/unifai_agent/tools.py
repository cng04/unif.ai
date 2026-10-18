"""Tools available to a persona agent during an agent-to-agent conversation.

The agent speaks only through send_message; any other text it produces stays private.
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
    {
        "name": "end_conversation",
        "description": "End the conversation once you have enough signal either way.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"reason": {"type": "STRING"}},
            "required": ["reason"],
        },
    },
    {
        "name": "check_availability",
        "description": "Look up when and where your human is free.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "lookup_profile",
        "description": "Fetch one field from your human's profile (e.g. interests, values, dealbreakers).",
        "parameters": {
            "type": "OBJECT",
            "properties": {"field": {"type": "STRING"}},
            "required": ["field"],
        },
    },
    {
        "name": "ask_my_human",
        "description": "Escalate a question your human's profile can't answer.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"question": {"type": "STRING"}},
            "required": ["question"],
        },
    },
]
