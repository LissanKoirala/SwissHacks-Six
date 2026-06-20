"""FastAPI app — the insights contract (CLAUDE.md §7.4) plus profile/portfolio/health routes.
Renders the orchestrator's output; nothing here makes decisions."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ..agents.orchestrator import get_insights
from ..analytics import build_analytics
from ..config import settings
from ..graph.crm_graph import build_crm_graph
from ..models import CaptureConfirmRequest, CaptureExtractRequest, RMQueryRequest
from ..seed import build_world


def create_app() -> FastAPI:
    app = FastAPI(title="Advisory Workbench", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        # any localhost port in dev — Next.js may fall back to 3001/3002 if 3000 is taken
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_methods=["*"], allow_headers=["*"],
    )
    world = build_world(use_live_news=settings.news_enabled)
    app.state.world = world

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
            {"name": "SEC EDGAR", "configured": bool(settings.sec_user_agent),
             "live": settings.sec_enabled, "mode": "live (no key)" if settings.sec_enabled else "seed filing fixtures"},
            {"name": "FMP (ESG/earnings/analyst/fundamentals)", "configured": bool(settings.fmp_key),
             "live": settings.fmp_enabled, "mode": "live" if settings.fmp_enabled else "seed signal fixtures"},
            {"name": "Macro/FX (Frankfurter/ECB)", "configured": True,
             "live": settings.macro_enabled, "mode": "live (no key)" if settings.macro_enabled else "seed macro fixtures"},
        ]
        return {"use_live": settings.use_live, "probes": probes}

    @app.get("/clients")
    def list_clients():
        out = []
        for cid in world.clients:
            ins = get_insights(world, cid)
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

    # --- ported features (builders lazy-imported so the app boots even mid-build) ---

    def _dump(out):
        return out.model_dump() if hasattr(out, "model_dump") else out

    @app.get("/clients/{client_id}/rendezvous")
    def client_rendezvous(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.rendezvous import build_rendezvous
        return _dump(build_rendezvous(world, client_id))

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

    @app.get("/clients/{client_id}/capture/prompts")
    def capture_prompts(client_id: str):
        if client_id not in world.clients:
            raise HTTPException(404, "unknown client")
        from ..agents.capture import build_capture_prompts
        return build_capture_prompts(world, client_id)

    return app


app = create_app()
