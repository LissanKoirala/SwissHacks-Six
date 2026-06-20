# Deploying the Advisory Workbench backend (with instant Gmail intake)

The backend ingests client email and turns it into RM tasks. Two intake modes:

- **Poll** (default, zero infra): the backend pulls the mailbox every N seconds. Works anywhere,
  no public URL. Good enough for most demos.
- **Instant push** (`/gmail/push`): Gmail notifies the backend the moment mail arrives, via a
  Pub/Sub topic. Real-time, but needs the backend on a public HTTPS URL + a little GCP setup.

Everything is **advisory-only**: ingestion creates and drafts tasks; an RM still signs off. Email
access is **read-only** (`gmail.readonly`) — the workbench can never send or modify mail.

---

## 1. Deploy the container

```bash
docker build -t workbench-backend ./backend
docker run -p 8000:8000 --env-file backend/.env workbench-backend
```

Or point a PaaS at `backend/Dockerfile` (it honours the platform's `$PORT`):
- **Render / Railway / Fly.io / Cloud Run** — "deploy from Dockerfile", set the env vars from
  `.env.example`, expose port 8000. You get a public HTTPS URL (needed for instant push).

Health check: `GET /health` and `GET /api/health/integrations` (shows which intake mode is live).

---

## 2. Connect Gmail (both modes need this — one-time OAuth)

1. Google Cloud Console → **enable the Gmail API**.
2. Create an **OAuth client** (type *Desktop app*), download the JSON to
   `backend/.gmail_client_secret.json`.
3. Authorise once:
   ```bash
   cd backend && python -m workbench.ingestion.gmail_oauth
   ```
   Sign in with the demo Gmail, approve read-only. It writes `.gmail_token.json` (a refresh token),
   or prints `GMAIL_OAUTH_*` values you can put in `.env` instead.
4. In `.env`: `USE_LIVE=1`, `EMAIL_PROVIDER=gmail`.

> For a container, bake the refresh token in via env (`GMAIL_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`)
> rather than shipping the token file — it survives redeploys and keeps secrets out of the image.

**That's it for poll mode** — set `FRONT_DOOR_POLL_SECONDS` (e.g. `15`) and you're done.

---

## 3. Turn on instant push (optional)

Requires the backend already reachable at a public HTTPS URL (step 1).

1. **Create a Pub/Sub topic** (e.g. `gmail-workbench`):
   ```bash
   gcloud pubsub topics create gmail-workbench
   ```
2. **Let Gmail publish to it** — grant the Gmail system service account Publisher on the topic:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-workbench \
     --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
     --role=roles/pubsub.publisher
   ```
3. **Create a push subscription** pointing at this backend's webhook, with the shared secret:
   ```bash
   gcloud pubsub subscriptions create gmail-workbench-sub \
     --topic=gmail-workbench \
     --push-endpoint="https://YOUR_PUBLIC_HOST/gmail/push?token=YOUR_SECRET"
   ```
4. **Set env and restart:**
   ```
   GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT/topics/gmail-workbench
   GMAIL_PUSH_TOKEN=YOUR_SECRET
   GMAIL_WATCH_LABELS=INBOX
   GMAIL_SUBJECT_FILTER=[workbench]    # or "" to ingest everything
   ```

On startup the backend calls `users.watch()` (and renews it every 6h — Gmail expires it after 7
days). New mail → Pub/Sub → `POST /gmail/push` → ingested in ~1s. The integrations probe will read
`Front Door intake: instant (Gmail push → /gmail/push)`.

### Notes / hardening
- The `?token=` shared secret is the minimum gate. For production, also verify the Pub/Sub OIDC JWT
  (`Authorization: Bearer …`) on the push request.
- The push handler is idempotent: it tracks Gmail's `historyId` and the pipeline dedups by message,
  so retries and overlapping notifications never double-create a task.
- If the stored `historyId` expires, the handler silently re-registers the watch and resumes.
