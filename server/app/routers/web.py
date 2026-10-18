"""Server-rendered pages: the admin universe list/detail and the public /join/<code> page."""

import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from html import escape
from urllib.parse import parse_qs, quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg import AsyncConnection

from app import repo
from app.config import get_settings
from app.db import get_conn
from app.services import photon

basic = HTTPBasic(auto_error=False)


def require_admin(creds: HTTPBasicCredentials | None = Depends(basic)) -> None:
    """HTTP basic auth on admin pages when ADMIN_PASSWORD is set (any username)."""
    password = get_settings().admin_password
    if password and not (creds and secrets.compare_digest(creds.password.encode(), password.encode())):
        raise HTTPException(401, headers={"WWW-Authenticate": "Basic"})


admin = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)], include_in_schema=False)
public = APIRouter(include_in_schema=False)


# ---------- helpers ----------


async def form_data(request: Request) -> dict[str, str]:
    # Parsed by hand so the server doesn't need python-multipart for two small forms.
    return {k: v[0].strip() for k, v in parse_qs((await request.body()).decode()).items()}


def normalize_phone(raw: str) -> str | None:
    """Best-effort E.164. Bare 10-digit numbers are assumed to be North American (+1)."""
    digits = re.sub(r"\D", "", raw)
    if raw.strip().startswith("+"):
        e164 = f"+{digits}"
    elif len(digits) == 10:
        e164 = f"+1{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        e164 = f"+{digits}"
    else:
        return None
    return e164 if re.fullmatch(r"\+[1-9]\d{7,14}", e164) else None


def invite_url(code: str) -> str:
    return f"{get_settings().public_url}/join/{code}"


def fmt_time(dt: datetime) -> str:
    return dt.astimezone().strftime("%b %-d, %-I:%M %p")


def page(title: str, body: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>
  :root {{ --bg:#fafaf9; --fg:#1c1917; --muted:#78716c; --line:#e7e5e4; --card:#fff; --accent:#4f46e5; --err:#b91c1c; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#1c1917; --fg:#f5f5f4; --muted:#a8a29e; --line:#44403c; --card:#292524; --accent:#a5b4fc; --err:#fca5a5; }}
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, sans-serif; }}
  main {{ max-width:860px; margin:0 auto; padding:32px 16px 64px; }}
  main.narrow {{ max-width:440px; }}
  h1 {{ font-size:24px; margin:0 0 4px; }} h2 {{ font-size:16px; margin:32px 0 12px; }}
  a {{ color:var(--accent); }} .muted {{ color:var(--muted); }} .err {{ color:var(--err); }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; }}
  form.row {{ display:flex; gap:8px; flex-wrap:wrap; }} form.row input {{ flex:1 1 180px; }}
  label {{ display:block; font-weight:500; margin:12px 0 4px; }}
  label.check {{ display:flex; gap:8px; align-items:flex-start; font-weight:400; font-size:14px; }}
  input[type=text], input[type=tel], input[type=email] {{ width:100%; padding:10px 12px; border:1px solid var(--line);
    border-radius:8px; background:var(--bg); color:var(--fg); font:inherit; }}
  button, .btn {{ display:inline-block; padding:10px 16px; border:0; border-radius:8px; background:var(--accent);
    color:var(--bg); font:inherit; font-weight:600; cursor:pointer; text-decoration:none; text-align:center; }}
  button.ghost {{ background:transparent; color:var(--accent); border:1px solid var(--line); padding:4px 10px; font-size:13px; }}
  .table {{ overflow-x:auto; }}
  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }}
  th a {{ color:inherit; text-decoration:none; }} th a:hover {{ text-decoration:underline; }}
  code {{ font-size:13px; word-break:break-all; }}
  .pill {{ font-size:12px; padding:2px 8px; border-radius:99px; border:1px solid var(--line); }}
  .pill.chatting {{ border-color:#d97706; color:#d97706; }} .pill.complete {{ border-color:#16a34a; color:#16a34a; }}
</style>
<script>
  function copyText(btn, text) {{
    navigator.clipboard.writeText(text).then(() => {{ btn.textContent = "Copied"; setTimeout(() => btn.textContent = "Copy", 1500); }});
  }}
</script>
</head><body>{body}</body></html>""",
        status_code=status,
    )


def copy_button(text: str) -> str:
    return f"""<button class="ghost" type="button" onclick="copyText(this, {escape(repr(text))})">Copy</button>"""


# ---------- admin ----------


@admin.get("", response_class=HTMLResponse)
async def admin_home(conn: AsyncConnection = Depends(get_conn)):
    rows = await (
        await conn.execute(
            """
            SELECT un.*, COUNT(u.id) AS member_count
            FROM universes un LEFT JOIN users u ON u.universe_id = un.id
            GROUP BY un.id ORDER BY un.created_at DESC
            """
        )
    ).fetchall()
    items = "".join(
        f"""<tr>
          <td><a href="/admin/universes/{r['id']}">{escape(r['name'])}</a></td>
          <td>{r['member_count']}</td>
          <td class="muted">{escape(r['status'])}</td>
          <td><code>{escape(invite_url(r['invite_code']))}</code> {copy_button(invite_url(r['invite_code']))}</td>
        </tr>"""
        for r in rows
    )
    table = (
        f'<div class="table"><table><tr><th>Name</th><th>Members</th><th>Status</th><th>Invite link</th></tr>{items}</table></div>'
        if rows
        else '<p class="muted">No universes yet.</p>'
    )
    return page(
        "Universes",
        f"""<main>
          <h1>Universes</h1>
          <p class="muted">Each universe is a pool of people who get matched into groups.</p>
          <h2>New universe</h2>
          <form class="row card" method="post" action="/admin/universes">
            <input type="text" name="name" placeholder="Name, e.g. LA Hacks" required maxlength="120">
            <input type="email" name="admin_email" placeholder="Admin email" required>
            <button>Create</button>
          </form>
          <h2>All universes</h2>
          {table}
        </main>""",
    )


@admin.post("/universes")
async def admin_create_universe(request: Request, conn: AsyncConnection = Depends(get_conn)):
    form = await form_data(request)
    if not form.get("name") or not form.get("admin_email"):
        raise HTTPException(400, "name and admin_email are required")
    row = await (
        await conn.execute(
            "INSERT INTO universes (name, admin_email, invite_code) VALUES (%s, %s, %s) RETURNING id",
            (form["name"][:120], form["admin_email"], secrets.token_urlsafe(6)),
        )
    ).fetchone()
    return RedirectResponse(f"/admin/universes/{row['id']}", status_code=303)


@admin.get("/universes/{universe_id}", response_class=HTMLResponse)
async def admin_universe(
    universe_id: UUID, sort: str = "joined", dir: str = "asc", conn: AsyncConnection = Depends(get_conn)
):
    universe = await repo.get_universe(conn, universe_id)
    if sort not in repo.USER_SORTS:
        sort = "joined"
    desc = dir == "desc"
    users = await repo.list_users_with_status(conn, universe_id, sort, desc)

    def header(key: str, label: str) -> str:
        active = key == sort
        next_dir = "asc" if active and desc else "desc" if active else "asc"
        arrow = (" ↓" if desc else " ↑") if active else ""
        return f'<th><a href="?sort={key}&dir={next_dir}">{label}{arrow}</a></th>'

    rows = "".join(
        f"""<tr>
          <td>{escape(u['full_name'])}</td>
          <td>{escape(u['phone'] or (f"ASI:One …{u['asi_address'][-6:]}" if u.get('asi_address') else '—'))}</td>
          <td class="muted">{fmt_time(u['created_at'])}</td>
          <td><span class="pill {u['status']}">{u['status']}</span></td>
        </tr>"""
        for u in users
    )
    members = (
        f"""<div class="table"><table>
          <tr>{header('name', 'Name')}{header('phone', 'Contact')}{header('joined', 'Joined')}{header('status', 'Onboarding')}</tr>
          {rows}
        </table></div>"""
        if users
        else '<p class="muted">No one has joined yet. Share the invite link.</p>'
    )
    link = invite_url(universe["invite_code"])
    return page(
        universe["name"],
        f"""<main>
          <p><a href="/admin">← Universes</a></p>
          <h1>{escape(universe['name'])}</h1>
          <p class="muted">{len(users)} member{'' if len(users) == 1 else 's'} · {escape(universe['status'])}</p>
          <div class="card"><strong>Invite link</strong><br><code>{escape(link)}</code> {copy_button(link)}</div>
          <h2>Members</h2>
          {members}
        </main>""",
    )


# ---------- public join page ----------


def asi_section(universe: dict, primary: bool) -> str:
    """How to join on ASI:One: open the agent, send `join <code>` so the bot puts them in this pool."""
    settings = get_settings()
    command = f"join {universe['invite_code']}"
    handle = escape(settings.asi_agent_handle)
    # ASI:One links can't pre-fill a message, so the button copies the join command, then opens the agent.
    open_btn = (
        f'<p><a class="btn" style="width:100%" href="{escape(settings.asi_agent_url)}" target="_blank" rel="noopener"'
        f" onclick='navigator.clipboard && navigator.clipboard.writeText({escape(json.dumps(command))})'>"
        f"Copy code &amp; chat with {handle}</a></p>"
        if settings.asi_agent_url
        else f"<p>Find <strong>{handle}</strong> on ASI:One and start a chat.</p>"
    )
    title = "Join on ASI:One" if primary else "Or join on ASI:One"
    return f"""<div class="card">
          <h2 style="margin-top:0">{title}</h2>
          {open_btn}
          <p>Paste this as your first message so we put you in <strong>{escape(universe['name'])}</strong>:</p>
          <p><code>{escape(command)}</code> {copy_button(command)}</p>
          <p class="muted">Forgot it? The agent will ask which group you're joining.</p>
        </div>"""


def join_form(
    universe: dict,
    error: str = "",
    name: str = "",
    phone: str = "",
    status: int = 200,
    imessage: bool = True,
    note: str = "",
) -> HTMLResponse:
    err = f'<p class="err">{escape(error)}</p>' if error else ""
    note_html = f'<p class="err">{escape(note)}</p>' if note else ""
    imessage_form = (
        f"""<form class="card" method="post">
            <h2 style="margin-top:0">Join over iMessage</h2>
            {err}
            <label for="name">Your name</label>
            <input type="text" id="name" name="name" value="{escape(name)}" required maxlength="120" autocomplete="name">
            <label for="phone">Phone number</label>
            <input type="tel" id="phone" name="phone" value="{escape(phone)}" required autocomplete="tel"
              placeholder="+1 555 123 4567">
            <label class="check"><input type="checkbox" name="consent" value="yes" required>
              I agree to receive messages from unif.ai's agent. Reply STOP to opt out.</label>
            <p><button style="width:100%">Join</button></p>
          </form>"""
        if imessage
        else ""
    )
    return page(
        f"Join {universe['name']}",
        f"""<main class="narrow">
          <h1>Join {escape(universe['name'])}</h1>
          <p class="muted">Our agent will chat with you for about 10 minutes to get to know you,
            then match you into a small friend group of 4–8 people.</p>
          {note_html}
          {asi_section(universe, primary=not imessage)}
          {imessage_form}
        </main>""",
        status,
    )


async def universe_for_code(conn: AsyncConnection, code: str) -> dict:
    row = await (await conn.execute("SELECT * FROM universes WHERE invite_code = %s", (code,))).fetchone()
    if row is None:
        raise HTTPException(404, "This invite link isn't valid.")
    return row


@public.get("/join/{code}", response_class=HTMLResponse)
async def join_page(code: str, conn: AsyncConnection = Depends(get_conn)):
    settings = get_settings()
    if settings.join_on_client:
        # Invite links and printed QR codes point here; the web app now renders the page.
        return RedirectResponse(f"{settings.client_url}/join/{quote(code)}", status_code=307)
    universe = await universe_for_code(conn, code)
    if universe["status"] != "onboarding":
        return page("Closed", '<main class="narrow"><h1>This group is closed</h1><p class="muted">It\'s no longer taking new members.</p></main>', 410)
    # iMessage only while Photon has free shared-line seats; ASI:One is always offered.
    return join_form(universe, imessage=await photon.imessage_open())


@dataclass
class JoinOutcome:
    """Result of a join attempt, shared by the HTML page and the JSON API (routers/invites.py)."""

    error: str | None = None  # bad input: show the form again with this message
    imessage_full: bool = False  # no iMessage seat: send them to ASI:One instead
    user: dict | None = None
    phone: str | None = None
    line: str | None = None  # the shared iMessage number to text; None if Photon couldn't assign one


IMESSAGE_FULL = "iMessage spots for this group are full, so please join on ASI:One instead."


async def join_pool(conn: AsyncConnection, universe: dict, name: str, raw_phone: str, consent: bool) -> JoinOutcome:
    """Validate a signup, create (or resume) the member, and assign them an iMessage line."""
    name = name.strip()[:120]
    if not name:
        return JoinOutcome(error="Please enter your name.")
    if not consent:
        return JoinOutcome(error="Please agree to receive messages so the agent can reach you.")
    phone = normalize_phone(raw_phone)
    if phone is None:
        return JoinOutcome(error="That phone number doesn't look right. Include your country code, e.g. +44…")

    # Same number in the same universe resumes the existing member instead of creating another.
    user = await repo.find_user_by_phone(conn, universe["id"], phone)
    created = user is None
    if created and not await photon.imessage_open():
        return JoinOutcome(imessage_full=True)
    if created:
        user = await repo.create_user(conn, universe["id"], name, phone=phone)
    await conn.commit()

    try:
        line = await photon.assign_line(phone, user["full_name"])
    except photon.SeatsFull:
        # Lost the race for the last seat. Undo the signup so they don't end up twice in the pool via ASI:One.
        if created:
            await conn.execute("DELETE FROM users WHERE id = %s", (user["id"],))
            await conn.commit()
        return JoinOutcome(imessage_full=True)
    return JoinOutcome(user=user, phone=phone, line=line)


def sms_link(line: str) -> str:
    return f"sms:{line}&body={quote('hi')}"


@public.post("/join/{code}", response_class=HTMLResponse)
async def join_submit(code: str, request: Request, conn: AsyncConnection = Depends(get_conn)):
    universe = await universe_for_code(conn, code)
    if universe["status"] != "onboarding":
        return page("Closed", '<main class="narrow"><h1>This group is closed</h1></main>', 410)

    form = await form_data(request)
    name, raw_phone = form.get("name", ""), form.get("phone", "")
    outcome = await join_pool(conn, universe, name, raw_phone, form.get("consent") == "yes")
    if outcome.error:
        return join_form(universe, outcome.error, name[:120], raw_phone, 400)
    if outcome.imessage_full:
        return join_form(universe, imessage=False, note=IMESSAGE_FULL)
    user, phone, line = outcome.user, outcome.phone, outcome.line
    if line is None:
        return page(
            "You're in",
            f"""<main class="narrow"><h1>You're in, {escape(user['full_name'].split()[0])}!</h1>
              <p class="muted">We couldn't set up your iMessage chat just now. We'll text you at
              {escape(phone)} soon. If you're not on iMessage, reply to this invite's sender and we'll sort it out.</p></main>""",
        )
    sms = sms_link(line)
    return page(
        "Text us to start",
        f"""<main class="narrow">
          <h1>You're in, {escape(user['full_name'].split()[0])}!</h1>
          <p>Text <strong>{escape(line)}</strong> from <strong>{escape(phone)}</strong> to start chatting with your agent.</p>
          <p><a class="btn" style="width:100%" href="{escape(sms)}">Text us to start</a></p>
          <p class="muted">The chat runs over iMessage. Reply STOP anytime to opt out.</p>
        </main>
        <script>location.href = {json.dumps(sms)};</script>""",
    )
