"""ASI:One relay agent for unif.ai onboarding.

People chat with this agent in ASI:One. Each message is forwarded to the bot's local HTTP channel
(onboarding/, run with CHANNELS=http), which runs the onboarding flow and writes the final profile to
Postgres. This file only carries messages; it holds no onboarding logic or state.
"""

import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

BOT_URL = os.environ.get("BOT_URL", "http://127.0.0.1:8787/message")
RELAY_TOKEN = os.environ.get("RELAY_TOKEN", "")
SEED = os.environ.get("AGENT_SEED")
if not SEED:
    raise SystemExit("Set AGENT_SEED (any long random phrase; it fixes the agent's address)")

agent = Agent(
    name="unif-onboarding",
    seed=SEED,
    port=int(os.environ.get("AGENT_PORT", "8001")),
    mailbox=True,  # reachable from ASI:One via Agentverse without a public URL
    publish_agent_details=True,
    # Short @handle shown in ASI:One instead of the agent1q… address (also settable on Agentverse).
    handle=os.environ.get("AGENT_HANDLE") or None,
    readme_path=os.path.join(os.path.dirname(__file__), "README.md"),
)
chat = Protocol(spec=chat_protocol_spec)
MENTION = re.compile(r"^(?:@\S+\s*)+")


def reply(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))

    text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    # ASI:One prefixes messages with "@<agent address or handle>"; strip it so commands like
    # "restart" and "join <code>" reach the bot as typed.
    text = MENTION.sub("", text).strip()
    if not text:
        return  # session start/end markers carry no text; the bot greets on the first real message

    headers = {"Authorization": f"Bearer {RELAY_TOKEN}"} if RELAY_TOKEN else {}
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # The sender's agent address identifies the person; the bot keeps one session per address.
            res = await client.post(BOT_URL, json={"chatId": f"asi:{sender}", "platform": "asi", "sender": sender, "text": text}, headers=headers)
        bubbles = res.json().get("bubbles", [])
        if res.status_code >= 400 and not bubbles:
            bubbles = ["sorry, something glitched on my end. can you send that again?"]
    except Exception:
        ctx.logger.exception("bot relay failed")
        bubbles = ["sorry, I can't reach my brain right now. try again in a minute?"]

    # ASI:One shows one message per reply, so join the bot's bubbles.
    if bubbles:
        await ctx.send(sender, reply("\n\n".join(bubbles)))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
