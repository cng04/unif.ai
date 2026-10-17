"""Connect the running agent to its Agentverse mailbox without the browser inspector.

Does what the inspector's Connect → Mailbox button does: hands the agent your Agentverse API key
via its local /connect endpoint, and the agent registers itself. Needs AGENTVERSE_API_KEY in .env
(Agentverse → profile → API Keys) and agent.py already running.
"""

import json
import os
import sys
import urllib.request

key = os.environ.get("AGENTVERSE_API_KEY")
if not key:
    sys.exit("Set AGENTVERSE_API_KEY in .env first")
port = os.environ.get("AGENT_PORT", "8001")
req = urllib.request.Request(
    f"http://127.0.0.1:{port}/connect",
    data=json.dumps({"user_token": key, "agent_type": "mailbox"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as res:
        print(res.read().decode())
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read().decode()}")
except urllib.error.URLError as e:
    sys.exit(f"Couldn't reach the agent on port {port}; is agent.py running? ({e.reason})")
