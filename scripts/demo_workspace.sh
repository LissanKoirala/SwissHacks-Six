#!/usr/bin/env bash
#
# demo_workspace.sh — seed & test the per-client Gmail/Calendar workflows for the Advisory
# Workbench, acting as the relationship manager's own Google account (default ordane4@gmail.com).
#
# It signs you in once (browser OAuth, token cached locally) and then, for each of the four
# personas, can:
#   • send a themed email TO their plus-address  -> shows under the client's Workspace "Correspondence"
#   • create a calendar invite INVITING their plus-address -> shows under "Upcoming meetings"
# Everything lands in the RM's one real inbox/calendar via plus-addressing
# (ordane4@gmail.com -> ordane4+schneider@gmail.com, …), which is exactly what the app reads.
#
# ─────────────────────────────────────────────────────────────────────────────
# SETUP (one time)
#   1. In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type
#      "Desktop app" (in the SAME project as the web app, so the consent screen + test users carry
#      over). Download its JSON.
#   2. Make sure the Gmail API and Google Calendar API are enabled in that project.
#   3. Point this script at the JSON and run it:
#
#        export GOOGLE_CLIENT_SECRETS_FILE=~/Downloads/client_secret_xxx.json
#        ./demo_workspace.sh seed
#
#      (Alternatively: export GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… from a Desktop client.)
#
# USAGE
#   ./demo_workspace.sh seed       # send emails + create calendar invites for all 4 clients
#   ./demo_workspace.sh emails     # just the emails
#   ./demo_workspace.sh calendar   # just the calendar invites
#   ./demo_workspace.sh list       # show what's currently visible per client (sanity check)
#   ./demo_workspace.sh clean      # delete the calendar events this script created
#   ./demo_workspace.sh auth       # just sign in / refresh the cached token
#
# ENV
#   RM_EMAIL                     RM Google account (default: ordane4@gmail.com)
#   GOOGLE_CLIENT_SECRETS_FILE   path to a Desktop OAuth client JSON  (preferred)
#   GOOGLE_CLIENT_ID / _SECRET   alternative to the JSON file
#   DEMO_TZ                      IANA tz for events (default: Europe/Zurich)
#   SEND_INVITES                 1 = also email the calendar invite to the plus-address (default 0)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RM_EMAIL="${RM_EMAIL:-ordane4@gmail.com}"
DEMO_TZ="${DEMO_TZ:-Europe/Zurich}"
SEND_INVITES="${SEND_INVITES:-0}"
CMD="${1:-seed}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.demo-venv"
TOKEN="$HERE/.demo-token.json"

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 not found — please install Python 3.9+." >&2
  exit 1
fi

# Validate we have some form of OAuth client creds (unless a token is already cached) — fail fast
# before spending time building the venv.
if [ ! -f "$TOKEN" ] && [ -z "${GOOGLE_CLIENT_SECRETS_FILE:-}" ] \
   && { [ -z "${GOOGLE_CLIENT_ID:-}" ] || [ -z "${GOOGLE_CLIENT_SECRET:-}" ]; }; then
  cat >&2 <<MSG
✗ No OAuth client credentials found.

  Set ONE of:
    export GOOGLE_CLIENT_SECRETS_FILE=/path/to/desktop_client_secret.json   (recommended)
    export GOOGLE_CLIENT_ID=…  GOOGLE_CLIENT_SECRET=…

  Create a "Desktop app" OAuth client in the same Google Cloud project as the workbench,
  then re-run:  ./demo_workspace.sh $CMD
MSG
  exit 1
fi

# One-time local venv with the Google client libraries.
if [ ! -x "$VENV/bin/python" ]; then
  echo "→ first run: creating local venv + installing Google client libraries…"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip >/dev/null
  "$VENV/bin/pip" install -q google-auth-oauthlib google-api-python-client >/dev/null
fi

exec "$VENV/bin/python" - "$CMD" "$RM_EMAIL" "$TOKEN" "$DEMO_TZ" "$SEND_INVITES" <<'PYEOF'
import base64, os, sys
from datetime import datetime, timedelta
from email.message import EmailMessage

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

cmd, rm_email, token_path, tz, send_invites = sys.argv[1:6]
send_invites = send_invites == "1"

# Only scopes already on the web app's consent screen — gmail.compose covers sending.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]
DEMO_TAG = "[demo-workspace]"  # stamped on events so `clean` can find them


def _local_part(addr):
    return addr.split("@", 1)[0].split("+", 1)[0]


def plus(addr, tag):
    local = _local_part(addr)
    domain = addr.split("@", 1)[1]
    return f"{local}+{tag}@{domain}"


# (client_id, display name, email subject, email body, meeting agenda) — themed to each persona.
CLIENTS = [
    ("schneider", "Hubertus Schneider",
     "Keeping the pharma sleeve aligned to Parkinson's research",
     "Hi Hubertus,\n\nAhead of our review I'm double-checking that the pharma names in your "
     "sleeve are still actively funding Parkinson's research, exactly as you asked. If any name "
     "steps back from that commitment I'll bring a same-sector, CIO-approved alternative.\n\n"
     "Warm regards,\nYour relationship manager",
     "Portfolio & relationship review — pharma mandate"),
    ("huber", "Marius Huber",
     "Defensive mandate — palm-oil / deforestation check-in",
     "Dear Marius,\n\nA quick note before we meet: I'm reviewing the consumer-goods holdings "
     "against the deforestation policy you care about, so we can act early if any supplier is "
     "flagged on palm-oil sourcing.\n\nBest,\nYour relationship manager",
     "Portfolio & relationship review — sustainability screen"),
    ("raeber", "Eugen Räber",
     "Rebalancing note — steering clear of US mega-cap AI",
     "Dear Mr Räber,\n\nNoting your preference to stay clear of US mega-cap AI names, I've "
     "prepared a rebalancing option that keeps the blue-chip tilt without adding that exposure. "
     "Happy to walk you through it.\n\nKind regards,\nYour relationship manager",
     "Portfolio & relationship review — rebalancing options"),
    ("ammann", "Julian Ammann",
     "Growth mandate — labour-standards flag on a held brand",
     "Hi Julian,\n\nHeads-up ahead of our catch-up: a consumer brand in your growth sleeve has a "
     "labour-standards story developing. I'll bring the detail and a screened, same-sector swap "
     "if you'd like to act.\n\nCheers,\nYour relationship manager",
     "Portfolio & relationship review — labour-standards flag"),
]


def get_creds():
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        secrets_file = os.environ.get("GOOGLE_CLIENT_SECRETS_FILE")
        if secrets_file:
            flow = InstalledAppFlow.from_client_secrets_file(secrets_file, SCOPES)
        else:
            cfg = {"installed": {
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }}
            flow = InstalledAppFlow.from_client_config(cfg, SCOPES)
        print(f"→ opening a browser to sign in as {rm_email} (grant Gmail + Calendar)…")
        creds = flow.run_local_server(port=0, prompt="consent",
                                      authorization_prompt_message="")
    with open(token_path, "w") as fh:
        fh.write(creds.to_json())
    return creds


def send_email(gmail, to_addr, subject, body):
    msg = EmailMessage()
    msg["To"] = to_addr
    msg["From"] = rm_email
    msg["Subject"] = subject
    msg.set_content(body)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = gmail.users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent.get("id")


def make_event(cal, name, attendee, agenda, days_out):
    start = (datetime.now() + timedelta(days=days_out)).replace(
        hour=10, minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    body = {
        "summary": f"Portfolio & relationship review — {name}",
        "description": f"{agenda}\n\n{DEMO_TAG} seeded by demo_workspace.sh",
        "start": {"dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "end": {"dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "attendees": [{"email": attendee}],
    }
    ev = cal.events().insert(
        calendarId="primary", body=body,
        sendUpdates="all" if send_invites else "none",
    ).execute()
    return ev.get("htmlLink")


def do_emails(creds):
    gmail = build("gmail", "v1", credentials=creds)
    print("\n✉  Sending themed emails to each client's plus-address:")
    for cid, name, subj, body, _ in CLIENTS:
        to = plus(rm_email, cid)
        mid = send_email(gmail, to, subj, body)
        print(f"   ✓ {name:18} → {to}   (id {mid})")


def do_calendar(creds):
    cal = build("calendar", "v3", credentials=creds)
    print("\n📅 Creating calendar invites (one per client):")
    for i, (cid, name, _, _, agenda) in enumerate(CLIENTS):
        to = plus(rm_email, cid)
        link = make_event(cal, name, to, agenda, days_out=2 + i)
        print(f"   ✓ {name:18} inviting {to}\n       {link}")
    if not send_invites:
        print("   (events created without emailing invites — set SEND_INVITES=1 to also send them)")


def do_list(creds):
    gmail = build("gmail", "v1", credentials=creds)
    cal = build("calendar", "v3", credentials=creds)
    now = datetime.utcnow().isoformat() + "Z"
    print("\n🔎 Current per-client view (what the app's Workspace tab will show):")
    for cid, name, *_ in CLIENTS:
        to = plus(rm_email, cid)
        msgs = gmail.users().messages().list(
            userId="me", q=f"from:{to} OR to:{to}", maxResults=5).execute().get("messages", [])
        evs = cal.events().list(
            calendarId="primary", q=to, timeMin=now, singleEvents=True,
            orderBy="startTime", maxResults=5).execute().get("items", [])
        print(f"   {name:18} {len(msgs)} email(s), {len(evs)} upcoming meeting(s)  [{to}]")


def do_clean(creds):
    cal = build("calendar", "v3", credentials=creds)
    now = datetime.utcnow().isoformat() + "Z"
    print("\n🧹 Removing calendar events seeded by this script:")
    removed = 0
    for cid, name, *_ in CLIENTS:
        to = plus(rm_email, cid)
        evs = cal.events().list(
            calendarId="primary", q=to, timeMin=now, singleEvents=True,
            maxResults=25).execute().get("items", [])
        for ev in evs:
            if DEMO_TAG in (ev.get("description") or ""):
                cal.events().delete(calendarId="primary", eventId=ev["id"]).execute()
                removed += 1
                print(f"   ✓ deleted: {ev.get('summary')}")
    print(f"   {removed} event(s) removed. (Test emails left in place — search '{DEMO_TAG}'? "
          "no; just search the +tag address to find/trash them.)")


creds = get_creds()
print(f"✓ signed in as {rm_email}")
if cmd == "auth":
    pass
elif cmd == "emails":
    do_emails(creds)
elif cmd == "calendar":
    do_calendar(creds)
elif cmd == "list":
    do_list(creds)
elif cmd == "clean":
    do_clean(creds)
elif cmd == "seed":
    do_emails(creds)
    do_calendar(creds)
else:
    print(f"unknown command: {cmd}  (use: seed | emails | calendar | list | clean | auth)")
    sys.exit(2)

if cmd in ("seed", "emails", "calendar"):
    print("\n✅ Done. Open the workbench → a client → the 'Workspace' tab to see it populate.")
PYEOF
