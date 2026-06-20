"""Transaction ledger + cash-flow analytics (HI4).

Derives cost basis, unrealised P&L, holding period and income yield from the immutable
Transactions / Cash Flows history. Every figure cites its workbook source (CLAUDE.md §7.5):
the spec lists 'Historical Transactions' and 'Historical Cash Flows' as data for every persona,
so this turns 882 trade rows + 313 cash-flow rows into cost basis, P&L and income context."""
from __future__ import annotations

from datetime import date, timedelta

from .graph.store import World


def _as_of(world: World, client_id: str) -> str:
    """The most recent timestamp across the client's trades + flows — a deterministic 'today'."""
    dates = [t.timestamp for t in world.transactions_for_client(client_id)]
    dates += [c.timestamp for c in world.cashflows_for_client(client_id)]
    return max((d for d in dates if d), default="")


def _days(a: str, b: str):
    try:
        return (date.fromisoformat(b) - date.fromisoformat(a)).days
    except Exception:
        return None


def build_ledger(world: World, client_id: str) -> dict:
    txns = sorted(world.transactions_for_client(client_id),
                  key=lambda t: t.timestamp, reverse=True)
    flows = sorted(world.cashflows_for_client(client_id),
                   key=lambda c: c.timestamp, reverse=True)
    holdings = {h.isin: h for h in world.holdings_for_client(client_id)}
    as_of = _as_of(world, client_id)

    # Per-position cost basis from the BUY/SELL history (net cash invested) + units + first buy.
    by_isin: dict[str, dict] = {}
    for t in world.transactions_for_client(client_id):
        b = by_isin.setdefault(t.isin, {"issuer": t.issuer, "units": 0.0, "buy_cost": 0.0,
                                        "sell_proceeds": 0.0, "first_buy": None})
        q = t.quantity or 0.0
        if t.side == "BUY":
            b["units"] += q
            b["buy_cost"] += t.amount_chf
            if b["first_buy"] is None or t.timestamp < b["first_buy"]:
                b["first_buy"] = t.timestamp
        else:
            b["units"] -= q
            b["sell_proceeds"] += t.amount_chf

    positions = []
    for isin, b in by_isin.items():
        h = holdings.get(isin)
        if h is None:
            continue  # only surface positions the client still holds
        cost_basis = max(0.0, b["buy_cost"] - b["sell_proceeds"])
        current = h.current_chf
        pnl = round(current - cost_basis, 2)
        positions.append({
            "isin": isin, "issuer": b["issuer"] or h.issuer,
            "units": round(b["units"], 2) if b["units"] else None,
            "cost_basis_chf": round(cost_basis, 2), "current_chf": round(current, 2),
            "unrealised_pnl_chf": pnl,
            "unrealised_pnl_pct": round(pnl / cost_basis * 100, 2) if cost_basis else None,
            "first_buy": b["first_buy"],
            "holding_period_days": _days(b["first_buy"], as_of) if b["first_buy"] else None,
            "provenance": h.provenance.model_dump() if h.provenance else None,
        })
    positions.sort(key=lambda p: -p["current_chf"])

    # Income: trailing-12-month COUPON inflows; net flows = deposits − withdrawals; fee drag.
    cutoff = None
    try:
        cutoff = (date.fromisoformat(as_of) - timedelta(days=365)).isoformat()
    except Exception:
        cutoff = None
    annual_income = sum(c.amount_chf for c in flows
                        if c.side == "COUPON" and (cutoff is None or c.timestamp >= cutoff))
    deposits = sum(c.amount_chf for c in flows if c.side == "DEPOSIT")
    withdrawals = sum(c.amount_chf for c in flows if c.side == "WITHDRAWAL")

    cost_basis_total = sum(p["cost_basis_chf"] for p in positions)
    current_total = sum(p["current_chf"] for p in positions)
    pnl_total = round(current_total - cost_basis_total, 2)
    portfolio_total = sum(h.current_chf for h in world.holdings_for_client(client_id)) or 1.0

    return {
        "portfolio": world.portfolio_of(client_id),
        "summary": {
            "cost_basis_chf": round(cost_basis_total, 2),
            "current_chf": round(current_total, 2),
            "unrealised_pnl_chf": pnl_total,
            "unrealised_pnl_pct": round(pnl_total / cost_basis_total * 100, 2) if cost_basis_total else None,
            "income_yield_pct": round(annual_income / portfolio_total * 100, 2) if portfolio_total else None,
            "annual_income_chf": round(annual_income, 2),
            "net_flows_chf": round(deposits - withdrawals, 2),
            "txn_count": len(txns),
            "buy_count": sum(1 for t in txns if t.side == "BUY"),
            "sell_count": sum(1 for t in txns if t.side == "SELL"),
        },
        "transactions": [{
            "transaction_id": t.transaction_id, "timestamp": t.timestamp, "isin": t.isin,
            "issuer": t.issuer, "side": t.side, "quantity": t.quantity,
            "price_local": t.price_local, "currency": t.currency, "fx_chf": t.fx_chf,
            "price_chf": t.price_chf, "amount_chf": t.amount_chf, "rationale": t.rationale,
            "price_source": t.price_source, "provenance": t.provenance.model_dump(),
        } for t in txns],
        "positions": positions,
        "cashflows": [{
            "flow_id": c.flow_id, "timestamp": c.timestamp, "side": c.side,
            "amount_chf": c.amount_chf, "rationale": c.rationale,
            "provenance": c.provenance.model_dump(),
        } for c in flows],
    }
