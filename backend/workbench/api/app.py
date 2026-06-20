"""FastAPI app — the insights contract (CLAUDE.md §7.4) plus profile/portfolio/health routes.
Renders the orchestrator's output; nothing here makes decisions."""
from __future__ import annotations

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from ..agents.orchestrator import get_insights, get_overview_insights
from ..analytics import build_analytics
from ..auth import init_oauth, require_user
from ..auth import router as auth_router
from ..briefing_service import compose_for, send_briefing
from ..agents.flight_fli import _fli_installed
from ..config import settings
from ..db import get_db, init_db
from ..db_models import RmUser
from ..graph.crm_graph import build_crm_graph
from ..models import (
    CaptureConfirmRequest,
    CaptureExtractRequest,
    CaptureFollowupRequest,
    EmailIngestRequest,
    RMQueryRequest,
    TaskCreateRequest,
    TaskSignoffRequest,
    TaskUpdateRequest,
    TTSRequest,
)
from ..scheduler import start_scheduler
from ..agents.news_watcher import start_news_watch
from ..seed import build_world


class BriefingPrefs(BaseModel):
    phone_e164: str | None = None
    briefing_hour: int | None = None
    briefing_enabled: bool | None = None


def create_app() -> FastAPI:
    app = FastAPI(title="Advisory Workbench", version="0.1.0")
    # SessionMiddleware first (innermost) so CORS is outermost and always adds headers,
    # even when the session layer throws.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="none",
        https_only=settings.session_https_only,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )
    world = build_world(use_live_news=settings.news_enabled)
    app.state.world = world

    @app.on_event("startup")
    async def _start_front_door():
        # Autonomous intake. Two modes, picked by config:
        #   • INSTANT push (Gmail watch→Pub/Sub→/gmail/push): register the watch and renew it daily
        #     (Gmail expires it after 7 days). New mail then arrives via the webhook, not a poll.
        #   • POLL (everything else): re-scan inbox + news on an interval.
        # Both are idempotent (dedup keys). Advisory only — CREATE + DRAFT; RM sign-off gate intact.
        import asyncio

        if settings.gmail_push_enabled:
            from ..ingestion.gmail_push import register_watch

            async def _watch_loop():
                while True:
                    try:
                        await asyncio.to_thread(register_watch)
                    except Exception:
                        pass
                    await asyncio.sleep(6 * 60 * 60)  # renew every 6h, well under the 7-day expiry

            app.state.poller_task = asyncio.create_task(_watch_loop())
            return

        if not settings.poll_enabled:
            return
        from ..taskboard import ingest_email, ingest_news

        async def _poll_loop():
            while True:
                await asyncio.sleep(settings.front_door_poll_seconds)
                try:  # one bad scan must never kill the loop
                    await asyncio.to_thread(ingest_email, world, execute=True, use_llm=False)
                    await asyncio.to_thread(ingest_news, world, execute=True)
                except Exception:
                    pass

        app.state.poller_task = asyncio.create_task(_poll_loop())

    @app.on_event("shutdown")
    async def _stop_front_door():
        task = getattr(app.state, "poller_task", None)
        if task is not None:
            task.cancel()

    @app.post("/gmail/push")
    async def gmail_push(request: Request):
        """Pub/Sub push endpoint — Gmail notifies us here the instant mail arrives. Verifies the
        shared-secret token, pulls everything new since the last historyId, and ingests it. Returns
        fast so Pub/Sub doesn't retry. Read-only + advisory: it only opens tasks for the RM."""
        import asyncio
        if settings.gmail_push_token and request.query_params.get("token") != settings.gmail_push_token:
            raise HTTPException(status_code=403, detail="invalid push token")
        from ..ingestion.gmail_push import sync_new_messages
        from ..taskboard import ingest_email

        msgs = await asyncio.to_thread(sync_new_messages)
        created = []
        for m in msgs:
            created += await asyncio.to_thread(
                ingest_email, world, raw_email=m, execute=True, use_llm=False
            )
        return {"ok": True, "ingested": len(msgs), "tasks_created": len(created)}

    @app.get("/health")
    def health():
        return {"status": "ok", "clients": list(world.clients.keys()),
                "news_items": len(world.news), "cio_universe": len(world.cio)}

    @app.get("/api/health/integrations")
    def integrations():
        probes = [
            {"name": "Phoeniqs LLM", "configured": bool(settings.phoeniqs_key),
             "live": settings.llm_enabled, "mode": "live" if settings.llm_enabled else "deterministic fallback"},
            {"name": "SIX MCP", "configured": bool(settings.six_token),
             "live": settings.six_enabled, "mode": "live" if settings.six_enabled else "workbook seed valuation"},
            {"name": "Event Registry", "configured": bool(settings.news_key),
             "live": settings.news_enabled, "mode": "live" if settings.news_enabled else "seed news fixtures"},
            {"name": f"STT ({settings.stt_provider})", "configured": settings.stt_enabled,
             "live": settings.stt_enabled,
             "mode": "live" if settings.stt_enabled else "browser Web Speech fallback"},
            {"name": f"TTS ({settings.tts_provider})", "configured": settings.tts_enabled,
             "live": settings.tts_enabled,
             "mode": "live" if settings.tts_enabled else "browser speechSynthesis fallback"},
            {"name": f"OCR ({settings.ocr_provider})", "configured": settings.ocr_enabled,
             "live": settings.ocr_enabled,
             "mode": "live" if settings.ocr_enabled else "unavailable"},
            {"name": "SEC EDGAR", "configured": bool(settings.sec_user_agent),
             "live": settings.sec_enabled, "mode": "live (no key)" if settings.sec_enabled else "seed filing fixtures"},
            {"name": "FMP (ESG/earnings/analyst/fundamentals)", "configured": bool(settings.fmp_key),
             "live": settings.fmp_enabled, "mode": "live" if settings.fmp_enabled else "seed signal fixtures"},
            {"name": "Macro/FX (Frankfurter/ECB)", "configured": True,
             "live": settings.macro_enabled, "mode": "live (no key)" if settings.macro_enabled else "seed macro fixtures"},
            {"name": "Google Flights (fli)", "configured": _fli_installed(),
             "live": settings.flights_enabled and _fli_installed(),
             "mode": "live" if settings.flights_enabled else "heuristic estimates"},
            {"name": f"Email inbox ({settings.email_provider})", "configured": settings.email_configured,
             "live": settings.email_enabled,
             "mode": (f"live {settings.email_provider}" if settings.email_enabled
                      else "seed inbox fixtures")},
            {"name": "Front Door intake", "configured": True,
             "live": settings.gmail_push_enabled or settings.poll_enabled,
             "mode": ("instant (Gmail push → /gmail/push)" if settings.gmail_push_enabled
                      else f"autonomous poll · every {settings.front_door_poll_seconds}s" if settings.poll_enabled
                      else "on-demand (boot + POST /ingest/*)")},
        ]
        return {"use_live": settings.use_live, "probes": probes, "stt": {
            "provider": settings.stt_provider, "enabled": settings.stt_enabled,
        }, "tts": {
            "provider": settings.tts_provider, "enabled": settings.tts_enabled,
        }, "ocr": {
            "provider": settings.ocr_provider, "enabled": settings.ocr_enabled,
            "model": settings.phoeniqs_ocr_model if settings.ocr_provider == "phoeniqs" else "",
        }}

    @app.get("/clients")
    def list_clients():
        # Summary only (name/mandate/headline/alert_count) — the LLM-free path keeps the strong
        # model lazy (§9). The full proposal + dialogue is built on demand at /clients/{id}/insights.
        out = []
        for cid in world.clients:
            ins = get_overview_insights(world, cid)
            out.append(ins.client.model_dump())
        return out

    @app.get("/clients/{client_id}")
    def get_client(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        profile = world.profiles.get(client_id)
        mandate = world.mandates.get(world.portfolio_of(client_id))
        return {
            "profile": profile.model_dump() if profile else None,
            "mandate": mandate.model_dump() if mandate else None,
            "log_count": len(world.meeting_logs.get(client_id, [])),
        }

    @app.get("/clients/{client_id}/insights")
    def client_insights(client_id: str, refresh: bool = False):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return get_insights(world, client_id, refresh=refresh).model_dump()

    @app.get("/clients/{client_id}/portfolio")
    def client_portfolio(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        holdings = world.holdings_for_client(client_id)
        mandate = world.mandates.get(world.portfolio_of(client_id))
        return {
            "portfolio": world.portfolio_of(client_id),
            "total_chf": round(sum(h.current_chf for h in holdings), 2),
            "mandate": mandate.model_dump() if mandate else None,
            "holdings": [h.model_dump() for h in holdings],
        }

    @app.get("/clients/{client_id}/fundamentals")
    def client_fundamentals(client_id: str):
        """Fundamentals + dividends + insider activity for the issuers this client holds.
        Reference/context data (never an alert) — feeds the portfolio view + dialogue."""
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return [f.model_dump() for f in world.fundamentals_for_client(client_id)]

    @app.get("/clients/{client_id}/log")
    def client_log(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return [e.model_dump() for e in world.meeting_logs.get(client_id, [])]

    @app.get("/clients/{client_id}/analytics")
    def client_analytics(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return build_analytics(world, client_id)

    @app.get("/clients/{client_id}/graph")
    def client_graph(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return build_crm_graph(world, client_id)

    @app.get("/news")
    def news():
        return [n.model_dump() for n in world.news]

    @app.get("/overview")
    def overview():
        """RM morning landing — aggregates across all clients (docs/OVERVIEW_CONTRACT.md)."""
        from ..agents.overview import build_overview
        return build_overview(world)

    # --- ported features (builders lazy-imported so the app boots even mid-build) ---

    def _dump(out):
        return out.model_dump() if hasattr(out, "model_dump") else out

    @app.get("/clients/{client_id}/rendezvous")
    def client_rendezvous(
        client_id: str,
        mode: str | None = None,
        event_start: str | None = None,
    ):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.rendezvous import build_rendezvous
        return _dump(build_rendezvous(world, client_id, mode=mode, event_start=event_start))

    @app.get("/clients/{client_id}/rendezvous/flight-quotes")
    def client_rendezvous_flight_quotes(
        client_id: str,
        iata: str,
        event_start: str | None = None,
    ):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.rendezvous import build_flight_quotes
        try:
            return build_flight_quotes(world, client_id, iata, event_start=event_start)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/clients/{client_id}/decision")
    def client_decision(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.decision import build_decision
        return _dump(build_decision(world, client_id))

    @app.get("/clients/{client_id}/globe")
    def client_globe(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..globe import build_globe
        return _dump(build_globe(world, client_id))

    @app.get("/clients/{client_id}/risk-timeline")
    def client_risk_timeline(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.risk_timeline import build_risk_timeline
        return _dump(build_risk_timeline(world, client_id))

    @app.get("/clients/{client_id}/opportunities")
    def client_opportunities(client_id: str):
        """NEW unheld CIO-BUY names aligned to the client's DNA (HI3) — proactive, news-independent."""
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.opportunities import build_opportunities
        return build_opportunities(world, client_id)

    @app.get("/clients/{client_id}/audit")
    def client_audit(client_id: str):
        """Proactive, news-independent standing-deviation audit (Portfolio Agent): held names that
        conflict with the client's DNA, CIO deviations, and mandate drift breaches — all cited."""
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.portfolio_audit import build_portfolio_audit
        return build_portfolio_audit(world, client_id)

    @app.get("/clients/{client_id}/transactions")
    def client_transactions(client_id: str):
        """Transaction ledger + cash flows: cost basis, unrealised P&L, income yield (HI4)."""
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..ledger import build_ledger
        return build_ledger(world, client_id)

    @app.post("/clients/{client_id}/query")
    def client_query(client_id: str, req: RMQueryRequest):
        """RM conversational query about a proposal (ST1): context answer or an alternative candidate."""
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.rm_interface import answer_query
        return answer_query(world, client_id, match_id=req.match_id,
                            question=req.question, exclude_isin=req.exclude_isin)

    # --- RM Capture (the app's first POSTs — agent proposes, RM confirms) ---

    @app.post("/clients/{client_id}/capture/extract")
    def capture_extract(client_id: str, req: CaptureExtractRequest):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.capture import extract_draft
        return _dump(extract_draft(world, client_id, req))

    @app.post("/clients/{client_id}/capture/confirm")
    def capture_confirm(client_id: str, req: CaptureConfirmRequest):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.capture import confirm_capture
        return _dump(confirm_capture(world, client_id, req))

    @app.post("/api/ocr")
    async def ocr_image(file: UploadFile = File(...)):
        from ..agents.ocr import OcrError, get_ocr
        if not settings.ocr_enabled:
            raise HTTPException(503, f"OCR not configured (provider={settings.ocr_provider})")
        image = await file.read()
        if not image:
            raise HTTPException(400, "empty image upload")
        try:
            text = get_ocr().read(image, file.content_type or "image/png")
        except OcrError as e:
            raise HTTPException(502, str(e))
        return {"text": text, "provider": settings.ocr_provider, "model": settings.phoeniqs_ocr_model}

    @app.post("/api/transcribe")
    async def transcribe_audio(file: UploadFile = File(...), language: str | None = Form(default=None)):
        # The frontend records via MediaRecorder and POSTs the blob. Provider is
        # swappable in agents/transcribe.py — route stays identical.
        from ..agents.transcribe import TranscribeError, get_transcriber
        if not settings.stt_enabled:
            raise HTTPException(503, f"STT not configured (provider={settings.stt_provider})")
        audio = await file.read()
        if not audio:
            raise HTTPException(400, "empty audio upload")
        try:
            text = get_transcriber().transcribe(audio, file.content_type or "audio/webm", file.filename or "audio.webm")
        except TranscribeError as e:
            raise HTTPException(502, str(e))
        return {"text": text, "provider": settings.stt_provider}

    @app.post("/api/tts")
    def synthesize_speech(req: TTSRequest):
        # Speaks one follow-up question for the conversational capture. Returns audio
        # bytes; the frontend falls back to browser speechSynthesis when disabled.
        from ..agents.tts import SynthError, get_synthesizer
        if not settings.tts_enabled:
            raise HTTPException(503, f"TTS not configured (provider={settings.tts_provider})")
        if not (req.text or "").strip():
            raise HTTPException(400, "empty text")
        try:
            audio, mime = get_synthesizer().synthesize(req.text)
        except SynthError as e:
            raise HTTPException(502, str(e))
        return Response(content=audio, media_type=mime)

    @app.get("/clients/{client_id}/capture/prompts")
    def capture_prompts(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.capture import build_capture_prompts
        return build_capture_prompts(world, client_id)

    @app.post("/clients/{client_id}/capture/followup")
    def capture_followup(client_id: str, req: CaptureFollowupRequest):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.capture import next_followup
        return next_followup(world, client_id, req.note, req.asked)

    # --- Auth (Google sign-in) + Twilio morning briefing -------------------------
    init_db()
    init_oauth()
    app.include_router(auth_router)

    @app.put("/me/briefing")
    def update_briefing(
        prefs: BriefingPrefs = Body(...),
        user: RmUser = Depends(require_user),
        db: Session = Depends(get_db),
    ):
        if prefs.phone_e164 is not None:
            user.phone_e164 = prefs.phone_e164.strip() or None
        if prefs.briefing_hour is not None:
            user.briefing_hour = max(0, min(23, prefs.briefing_hour))
        if prefs.briefing_enabled is not None:
            user.briefing_enabled = prefs.briefing_enabled
        db.commit()
        return {
            "ok": True,
            "phone_e164": user.phone_e164,
            "briefing_hour": user.briefing_hour,
            "briefing_enabled": user.briefing_enabled,
        }

    @app.post("/briefing/send-test")
    def briefing_send_test(
        user: RmUser = Depends(require_user), db: Session = Depends(get_db)
    ):
        """Compose + send the morning briefing now — the demo trigger (no 09:00 wait)."""
        return send_briefing(db, world, user, force=True)

    @app.get("/briefing/preview")
    def briefing_preview():
        """The composed briefing text over the seed book — visible even logged-out."""
        return {"text": compose_for(world)}

    @app.get("/breaking")
    def breaking():
        """Breaking alerts the 24/7 news watch has surfaced since boot (newest first)."""
        return {"alerts": world.breaking, "watch_enabled": settings.news_watch_enabled}

    @app.post("/breaking/poll")
    def breaking_poll():
        """Run one news-watch tick on demand (the demo trigger — no interval wait). Ingests any new
        live news, surfaces fresh matches as breaking alerts. No-op offline."""
        from ..agents.news_watcher import poll_once
        return {"new_alerts": poll_once(world, push=False)}

    # --- Google Workspace (Gmail read/draft + Calendar read/add) -----------------

    class DraftBody(BaseModel):
        to: str
        subject: str = ""
        body: str = ""

    class EventBody(BaseModel):
        summary: str
        start: str  # ISO datetime, e.g. 2026-06-22T14:00:00+02:00
        end: str
        attendees: list[str] = []
        description: str = ""
        location: str = ""

    def _gtoken(user: RmUser, db: Session):
        if not settings.workspace_enabled:
            raise HTTPException(503, "Google workspace not configured (scopes + TOKEN_ENC_KEY)")
        from ..google_api import token_for

        row = token_for(db, user)
        if row is None:
            raise HTTPException(409, "Google not connected — sign in again to grant Gmail/Calendar")
        return row

    @app.get("/integrations/google/inbox")
    def google_inbox(user: RmUser = Depends(require_user), db: Session = Depends(get_db)):
        from ..agents.google_workspace import GoogleError, list_inbox

        row = _gtoken(user, db)
        try:
            return {"messages": list_inbox(db, row)}
        except GoogleError as e:
            raise HTTPException(502, str(e))

    @app.post("/integrations/google/draft")
    def google_draft(body: DraftBody, user: RmUser = Depends(require_user), db: Session = Depends(get_db)):
        from ..agents.google_workspace import GoogleError, create_draft

        row = _gtoken(user, db)
        try:
            return create_draft(db, row, body.to, body.subject, body.body)
        except GoogleError as e:
            raise HTTPException(502, str(e))

    @app.get("/integrations/google/calendar")
    def google_calendar(user: RmUser = Depends(require_user), db: Session = Depends(get_db)):
        from ..agents.google_workspace import GoogleError, list_events

        row = _gtoken(user, db)
        try:
            return {"events": list_events(db, row)}
        except GoogleError as e:
            raise HTTPException(502, str(e))

    @app.post("/integrations/google/calendar")
    def google_add_event(body: EventBody, user: RmUser = Depends(require_user), db: Session = Depends(get_db)):
        from ..agents.google_workspace import GoogleError, create_event

        row = _gtoken(user, db)
        try:
            return create_event(
                db, row, summary=body.summary, start=body.start, end=body.end,
                attendees=body.attendees, description=body.description, location=body.location,
            )
        except GoogleError as e:
            raise HTTPException(502, str(e))

    start_scheduler(world)
    start_news_watch(world)

    @app.on_event("startup")
    def _warm_insights_cache() -> None:
        # Warm the LLM-FREE overview path only (matching is a free index intersection). The strong
        # model stays lazy — it runs on first RM open of a client, never speculatively for all of
        # them at boot (CLAUDE.md §9 token discipline). This is what keeps the morning briefing /
        # desk overview instant instead of waiting on 4 parallel Phoeniqs calls.
        from concurrent.futures import ThreadPoolExecutor
        import threading
        from ..agents.orchestrator import get_overview_insights
        def _warm():
            client_ids = list(world.clients)
            with ThreadPoolExecutor(max_workers=len(client_ids) or 1) as pool:
                futures = [pool.submit(get_overview_insights, world, cid) for cid in client_ids]
                for f in futures:
                    try:
                        f.result()
                    except Exception:
                        pass
        threading.Thread(target=_warm, daemon=True).start()

    # --- The Front Door: inbox + agentic kanban board -----------------------
    # The agent proposes (creates tasks, drafts deliverables); the RM disposes (sign-off / move /
    # dismiss). Nothing here sends an email or places a trade (Golden rule §2).

    @app.get("/inbox")
    def inbox():
        """The triaged inbound-email feed behind the board (seed fixtures, or live IMAP)."""
        return [e.model_dump() for e in world.inbox]

    @app.get("/tasks")
    def tasks(client_id: str | None = None, status: str | None = None):
        from ..taskboard import list_tasks
        if client_id and client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return [t.model_dump() for t in list_tasks(world, client_id=client_id, status=status)]

    @app.get("/clients/{client_id}/tasks")
    def client_tasks(client_id: str):
        from ..taskboard import list_tasks
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        return [t.model_dump() for t in list_tasks(world, client_id=client_id)]

    @app.get("/tasks/{task_id}")
    def get_task(task_id: str):
        t = world.task_by_id(task_id)
        if t is None:
            raise HTTPException(404, "unknown task")
        return t.model_dump()

    @app.post("/tasks")
    def create_task(req: TaskCreateRequest):
        from ..taskboard import add_task
        from ..agents.task_executor import execute_task
        if req.client_id and req.client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        task = add_task(world, title=req.title, detail=req.detail, client_id=req.client_id,
                        kind=req.kind, priority=req.priority, source="manual")
        if req.execute:
            execute_task(world, task)
            from ..taskboard import _save
            _save(world)
        return task.model_dump()

    @app.patch("/tasks/{task_id}")
    def patch_task(task_id: str, req: TaskUpdateRequest):
        from ..taskboard import update_task
        t = update_task(world, task_id, status=req.status, priority=req.priority,
                        title=req.title, detail=req.detail)
        if t is None:
            raise HTTPException(404, "unknown task")
        return t.model_dump()

    @app.post("/tasks/{task_id}/execute")
    def execute_task_route(task_id: str):
        from ..taskboard import run_task
        t = run_task(world, task_id)
        if t is None:
            raise HTTPException(404, "unknown task")
        return t.model_dump()

    @app.post("/tasks/{task_id}/signoff")
    def signoff_task_route(task_id: str, req: TaskSignoffRequest):
        from ..taskboard import signoff_task
        t = signoff_task(world, task_id, rm_name=req.rm_name, edited_body=req.edited_body)
        if t is None:
            raise HTTPException(404, "unknown task")
        return t.model_dump()

    @app.post("/tasks/{task_id}/dismiss")
    def dismiss_task_route(task_id: str):
        from ..taskboard import update_task
        t = update_task(world, task_id, status="dismissed")
        if t is None:
            raise HTTPException(404, "unknown task")
        return t.model_dump()

    @app.post("/ingest/email")
    def ingest_email_route(req: EmailIngestRequest | None = None):
        """Scan the inbox (seed fixtures or live IMAP) → triage → create + attempt tasks."""
        from ..taskboard import ingest_email
        raw = req.raw_email if req else None
        created = ingest_email(world, raw_email=raw)
        return {"created": [t.model_dump() for t in created], "count": len(created)}

    @app.post("/ingest/news")
    def ingest_news_route():
        """Run the selective news/risk watch → create + attempt tasks on material signals only."""
        from ..taskboard import ingest_news
        created = ingest_news(world)
        return {"created": [t.model_dump() for t in created], "count": len(created)}

    @app.get("/api/link-preview")
    def link_preview(url: str):
        """OG/Twitter thumbnail or favicon fallback for provenance source cards."""
        from ..link_unfurl import unfurl_link

        try:
            return unfurl_link(url).model_dump()
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    return app


app = create_app()
