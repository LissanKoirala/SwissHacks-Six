"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TransactionsData,
  LedgerTxn,
  LedgerPosition,
  LedgerCashFlow,
} from "@/lib/types";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { chf, pct, price, prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerLogo } from "./IssuerLogo";
import { Collapsible } from "./ui";
import { ProvenanceTag } from "./Provenance";

/* ------------------------------------------------------- collapsible bar --- */

// A card-section header that toggles its body. Keeps the existing uppercase bar
// look; the border only shows while open so a collapsed header reads as one row.
function CardToggle({
  open,
  toggle,
  label,
  count,
}: {
  open: boolean;
  toggle: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50",
        open && "border-b border-slate-200",
      )}
    >
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
          open && "rotate-90",
        )}
        aria-hidden
      />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {typeof count === "number" && (
        <span className="ml-auto text-xs tabular-nums text-slate-400">{count}</span>
      )}
    </button>
  );
}

/* --------------------------------------------------------------- figures --- */

// Mirrors PortfolioCharts' FigureCard: 2xl number + uppercase label, with an
// optional sub-line for the secondary figure (pct / annual income).
function FigureCard({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "green" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "text-emerald-600"
      : tone === "red"
      ? "text-rose-600"
      : "text-ink";
  return (
    <div className="card px-4 py-3.5">
      <p className={`text-2xl font-semibold tabular-nums leading-none ${toneCls}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs tabular-nums text-slate-400">{sub}</p>
      )}
      <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- chips --- */

function SideChip({ side }: { side: string }) {
  const s = side.toUpperCase();
  const sell = s === "SELL" || s === "OUTFLOW" || s === "WITHDRAWAL";
  return (
    <span
      className={`chip ring-1 ring-inset ${
        sell
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
      }`}
    >
      {s}
    </span>
  );
}

/* ----------------------------------------------------------------- view ---- */

export function TransactionsView({ clientId }: { clientId: string }) {
  const [data, setData] = useState<TransactionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .transactions(clientId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  // Don't assume the API pre-sorts: largest positions first, most-recent rows first.
  const positions = useMemo<LedgerPosition[]>(() => {
    if (!data) return [];
    return [...data.positions].sort((a, b) => b.current_chf - a.current_chf);
  }, [data]);

  const transactions = useMemo<LedgerTxn[]>(() => {
    if (!data) return [];
    return [...data.transactions].sort(
      (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)
    );
  }, [data]);

  const cashflows = useMemo<LedgerCashFlow[]>(() => {
    if (!data) return [];
    return [...data.cashflows].sort(
      (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)
    );
  }, [data]);

  if (loading) {
    return <p className="p-5 text-sm text-slate-500">Loading transactions…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600">
        Could not load transactions: {error}
      </p>
    );
  }
  if (!data) return null;

  const s = data.summary;
  const pnlTone: "green" | "red" = s.unrealised_pnl_chf >= 0 ? "green" : "red";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold text-ink">
          {data.portfolio} ledger
        </h3>
        <span className="text-sm text-slate-500">
          {s.txn_count} transactions · {s.buy_count} buy · {s.sell_count} sell
        </span>
      </div>

      {/* 1. Figure cards ------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <FigureCard label="Cost basis" value={chf(s.cost_basis_chf)} />
        <FigureCard label="Market value" value={chf(s.current_chf)} />
        <FigureCard
          label="Unrealised P&L"
          value={chf(s.unrealised_pnl_chf)}
          sub={s.unrealised_pnl_pct != null ? pct(s.unrealised_pnl_pct, 2) : undefined}
          tone={pnlTone}
        />
        <FigureCard
          label="Income yield"
          value={pct(s.income_yield_pct, 2)}
          sub={
            s.annual_income_chf != null
              ? `${chf(s.annual_income_chf)} / yr`
              : undefined
          }
        />
        <FigureCard
          label="Net flows"
          value={`${s.net_flows_chf >= 0 ? "+" : "−"}${chf(
            Math.abs(s.net_flows_chf)
          )}`}
          tone={s.net_flows_chf >= 0 ? "green" : "red"}
        />
      </div>

      {/* 2. Positions · cost basis vs market ----------------------------- */}
      <section className="card overflow-hidden">
        <Collapsible
          defaultOpen
          trigger={(open, toggle) => (
            <CardToggle
              open={open}
              toggle={toggle}
              label="Positions · cost basis vs market"
              count={positions.length}
            />
          )}
        >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Issuer</th>
                <th className="px-4 py-2 text-right font-medium">Units</th>
                <th className="px-4 py-2 text-right font-medium">Cost basis</th>
                <th className="px-4 py-2 text-right font-medium">Market value</th>
                <th className="px-4 py-2 text-right font-medium">Unrealised P&L</th>
                <th className="px-4 py-2 text-right font-medium">Holding period</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const pnlCls =
                  p.unrealised_pnl_chf >= 0 ? "text-emerald-600" : "text-rose-600";
                return (
                  <tr
                    key={`${p.isin}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <IssuerLogo issuer={p.issuer} isin={p.isin} size="sm" />
                        <div>
                          <span className="font-medium text-ink">{p.issuer}</span>
                          {p.provenance && (
                            <ProvenanceTag prov={p.provenance} label="src" />
                          )}
                          <div className="font-mono text-[11px] text-slate-400">
                            {p.isin}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                      {p.units != null ? p.units.toLocaleString("en-GB") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                      {chf(p.cost_basis_chf)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                      {chf(p.current_chf)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${pnlCls}`}>
                      <div className="flex flex-col items-end leading-tight">
                        <span>{chf(p.unrealised_pnl_chf)}</span>
                        {p.unrealised_pnl_pct != null && (
                          <span className="text-[11px]">
                            {pct(p.unrealised_pnl_pct, 2)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {p.holding_period_days != null
                        ? `${p.holding_period_days.toLocaleString("en-GB")}d`
                        : p.first_buy
                        ? prettyDate(p.first_buy)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </Collapsible>
      </section>

      {/* 3. Transaction history ------------------------------------------ */}
      <section className="card overflow-hidden">
        <Collapsible
          defaultOpen
          trigger={(open, toggle) => (
            <CardToggle
              open={open}
              toggle={toggle}
              label="Transaction history"
              count={s.txn_count}
            />
          )}
        >
        <div className="scroll-thin max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Side</th>
                <th className="px-4 py-2 font-medium">Issuer</th>
                <th className="px-4 py-2 text-right font-medium">Quantity</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr
                  key={`${t.transaction_id}-${i}`}
                  className="border-t border-slate-100 align-top hover:bg-slate-50"
                >
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums text-ink-soft">
                    {prettyDate(t.timestamp)}
                  </td>
                  <td className="px-4 py-2">
                    <SideChip side={t.side} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <IssuerLogo issuer={t.issuer} isin={t.isin} size="sm" />
                      <div>
                        <span className="font-medium text-ink">{t.issuer}</span>
                        <div className="font-mono text-[11px] text-slate-400">
                          {t.isin}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                    {t.quantity != null ? t.quantity.toLocaleString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                    {t.price_chf != null ? price(t.price_chf, "CHF") : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                    {chf(t.amount_chf)}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">
                    {t.rationale ? (
                      <span className="inline-flex flex-wrap items-baseline gap-x-1">
                        <span className="max-w-md whitespace-normal break-words">
                          {t.rationale}
                        </span>
                        {t.provenance && (
                          <ProvenanceTag prov={t.provenance} label="src" />
                        )}
                      </span>
                    ) : t.provenance ? (
                      <ProvenanceTag prov={t.provenance} label="src" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Collapsible>
      </section>

      {/* 4. Cash flows --------------------------------------------------- */}
      <section className="card overflow-hidden">
        <Collapsible
          defaultOpen
          trigger={(open, toggle) => (
            <CardToggle
              open={open}
              toggle={toggle}
              label="Cash flows"
              count={cashflows.length}
            />
          )}
        >
        {cashflows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">
            No cash flows recorded.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cashflows.map((c, i) => {
              const inflow = c.amount_chf >= 0;
              return (
                <li
                  key={`${c.flow_id}-${i}`}
                  className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
                >
                  <span className="whitespace-nowrap tabular-nums text-ink-soft">
                    {prettyDate(c.timestamp)}
                  </span>
                  <SideChip side={c.side} />
                  {c.rationale && (
                    <span className="text-ink-soft">{c.rationale}</span>
                  )}
                  {c.provenance && (
                    <ProvenanceTag prov={c.provenance} label="src" />
                  )}
                  <span
                    className={`ml-auto tabular-nums font-medium ${
                      inflow ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {inflow ? "+" : "−"}
                    {chf(Math.abs(c.amount_chf))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        </Collapsible>
      </section>
    </div>
  );
}
