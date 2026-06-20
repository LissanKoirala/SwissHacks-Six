"""One-time Gmail OAuth setup — run this ONCE to authorise the workbench to read a Gmail inbox.

A teammate does this after the integration is merged; nothing secret lives in the repo. Flow:

  1. In Google Cloud Console: create an OAuth 2.0 Client ID of type "Desktop app", enable the
     Gmail API, and download the client secret JSON.
  2. Save it (default path below), then run:
         cd backend && python -m workbench.ingestion.gmail_oauth
     A browser opens; sign in with the demo Gmail and approve read-only access.
  3. It writes a token file (refresh token) to GMAIL_TOKEN_FILE and prints the refresh token so it
     can alternatively go in .env as GMAIL_OAUTH_REFRESH_TOKEN (+ client id/secret).
  4. Set in .env:  USE_LIVE=1  EMAIL_PROVIDER=gmail   — the backend now pulls Gmail, read-only.

Read-only scope only (gmail.readonly): the workbench can never send or modify mail (§2).
"""
from __future__ import annotations

import os
import sys

from ..config import settings

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
DEFAULT_CLIENT_SECRET = os.getenv(
    "GMAIL_CLIENT_SECRET_FILE",
    str(settings.gmail_token_file).replace(".gmail_token.json", ".gmail_client_secret.json"),
)


def main() -> None:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except Exception:
        sys.exit(
            "Missing OAuth libraries. Install them first:\n"
            "  pip install google-auth-oauthlib google-api-python-client google-auth"
        )

    client_secret = os.getenv("GMAIL_CLIENT_SECRET_FILE", DEFAULT_CLIENT_SECRET)
    if not os.path.exists(client_secret):
        sys.exit(
            f"OAuth client secret not found at: {client_secret}\n"
            "Download a 'Desktop app' OAuth client JSON from Google Cloud Console (Gmail API "
            "enabled), save it there, or set GMAIL_CLIENT_SECRET_FILE to its path."
        )

    flow = InstalledAppFlow.from_client_secrets_file(client_secret, SCOPES)
    creds = flow.run_local_server(port=0)  # opens a browser, handles the redirect

    token_path = settings.gmail_token_file
    with open(token_path, "w") as f:
        f.write(creds.to_json())

    print(f"\n✓ Authorised. Token written to: {token_path}")
    print("  The backend will now use it when EMAIL_PROVIDER=gmail and USE_LIVE=1.\n")
    if creds.refresh_token:
        print("Alternatively, put these in .env instead of the token file:")
        print(f"  GMAIL_OAUTH_CLIENT_ID={creds.client_id}")
        print(f"  GMAIL_OAUTH_CLIENT_SECRET={creds.client_secret}")
        print(f"  GMAIL_OAUTH_REFRESH_TOKEN={creds.refresh_token}")


if __name__ == "__main__":
    main()
