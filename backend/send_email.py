#!/usr/bin/env python3
"""Demo: "send" the workbench an email and watch the Front Door work it.

No SMTP, no Docker, no mailbox — this just hands one email to the running backend
(POST /ingest/email). The backend then does the whole loop on its own:

    scan → triage → add a task (if it warrants one) → the agent attempts it →
    parks the draft in 'Needs sign-off' for a human (advisory only — never sent/traded).

Usage:
    # backend must be running:  uvicorn workbench.api.app:app --reload
    python send_email.py
    python send_email.py --subject "Book a Q3 review" --body "Can we catch up next week?"
    python send_email.py --from-name "Mrs Huber" --subject "Palm oil concerns" --body "..."

Pure stdlib (urllib) — nothing to install.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def _post(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    ap = argparse.ArgumentParser(description='"Send" the workbench an email and show what it does.')
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--from-name", default="Mr Schneider")
    ap.add_argument("--from-email", default="schneider@example.com")
    ap.add_argument("--subject", default="Please sell my pharma position urgently")
    ap.add_argument("--body", default=(
        "I'm worried about the research-division shutdown you mentioned. "
        "Please get me out of that pharma name today — I don't want to carry it."
    ))
    args = ap.parse_args()

    email = {
        "from_name": args.from_name,
        "from_email": args.from_email,
        "subject": args.subject,
        "body": args.body,
    }
    print(f"→ Sending email to the workbench at {args.api}")
    print(f"    From:    {args.from_name} <{args.from_email}>")
    print(f"    Subject: {args.subject}\n")

    try:
        out = _post(f"{args.api}/ingest/email", {"raw_email": email})
    except urllib.error.URLError as e:
        raise SystemExit(f"Could not reach the backend at {args.api} — is it running?\n  {e}")

    created = out.get("created", [])
    if not created:
        print("The Front Door read it but didn't open a task (nothing actionable). Nothing to hand off.")
        return

    for t in created:
        art = t.get("artifact") or {}
        status = t.get("status")
        handoff = {
            "review": "→ parked in 'Needs sign-off' for the RM",
            "started": "→ groundwork done, left in 'Started' for the RM to carry forward",
            "done": "→ done",
        }.get(status, f"→ {status}")
        print("┌─ Task opened ─────────────────────────────────────────────")
        print(f"│ {t.get('title')}")
        print(f"│ kind={t.get('kind')}  priority={t.get('priority')}  status={status}  {handoff}")
        if art.get("summary"):
            print(f"│\n│ Agent attempt: {art['summary']}")
        body = (art.get("body") or "").strip()
        if body:
            for line in body.splitlines():
                print(f"│   {line}")
        if art.get("draft_email"):
            de = art["draft_email"]
            print(f"│\n│ Drafted reply (NOT sent — awaiting RM): “{de.get('subject')}”")
        print("└───────────────────────────────────────────────────────────\n")

    print(f"Done — {len(created)} task(s). The RM approves; nothing was sent or traded.")
    print("See the full board:  curl -s localhost:8000/tasks")


if __name__ == "__main__":
    main()
