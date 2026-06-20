"use client";

import type {
  StrategyProposal,
  Swap,
  SwapAction,
  GoodNewsBriefing,
  SubstitutionMetrics,
} from "@/lib/types";
import { chf, price, prettyDate } from "@/lib/format";
import { IssuerLogo } from "./IssuerLogo";
import { Expander } from "./ui";
import { ProvenanceList } from "./Provenance";
import { ConfirmGate } from "./ConfirmGate";

const ACTION_META: Record<SwapAction, string> = {
  SWAP: "bg-accent-soft text-accent-ink ring-accent/30",
  INCREASE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  HOLD: "bg-slate-100 text-slate-600 ring-slate-200",
  DIVEST: "bg-rose-50 text-rose-700 ring-rose-200",
  REDUCE: "bg-amber-50 text-amber-700 ring-amber-200",
};

function ActionChip({ action }: { action: SwapAction }) {
  const cls = ACTION_META[action] ?? ACTION_META.HOLD;
  return (
    <span className={`chip ring-1 ring-inset ${cls} font-semibold`}>
      {action}
    </span>
  );
}

const asPct = (v?: number | null, dp = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(dp)}%`;
const asNum = (v?: number | null, dp = 2) =>
  v == null ? "—" : v.toFixed(dp);

/** Sold-vs-replacement comparison (Ammann 'substitution metrics'). */
function SubstitutionTable({ sub }: { sub: SubstitutionMetrics }) {
  const rows: { label: string; sell: string; buy: string; flag?: boolean }[] = [
    {
      label: "Volatility (30d)",
      sell: asPct(sub.vol_sell),
      buy: asPct(sub.vol_buy),
      flag: sub.vol_delta != null && Math.abs(sub.vol_delta) > 0.05,
    },
    { label: "Beta", sell: asNum(sub.beta_sell), buy: asNum(sub.beta_buy) },
    { label: "P/E", sell: asNum(sub.pe_sell, 1), buy: asNum(sub.pe_buy, 1) },
    {
      label: "Sentiment",
      sell: asNum(sub.sentiment_sell),
      buy: asNum(sub.sentiment_buy),
    },
  ];
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Substitution metrics
        </span>
        {sub.sector_match && (
          <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
            ✓ Same sector
          </span>
        )}
        {sub.vol_delta != null && (
          <span
            className={`chip ring-1 ring-inset ${
              Math.abs(sub.vol_delta) <= 0.05
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-amber-200"
            }`}
          >
            Risk Δ {sub.vol_delta >= 0 ? "+" : ""}
            {(sub.vol_delta * 100).toFixed(1)}pp
          </span>
        )}
        {sub.risk_source && (
          <span className="ml-auto text-[10px] text-slate-400">
            risk: {sub.risk_source}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-1 font-medium">Metric</th>
            <th className="py-1 text-right font-medium">
              {sub.sell_issuer ?? "Sold"}
            </th>
            <th className="py-1 text-right font-medium">
              {sub.buy_issuer ?? "Replacement"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="py-1 text-slate-500">{r.label}</td>
              <td className="py-1 text-right tabular-nums text-ink-soft">
                {r.sell}
              </td>
              <td
                className={`py-1 text-right tabular-nums ${
                  r.flag ? "text-amber-700" : "text-ink"
                }`}
              >
                {r.buy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(sub.value_tags_sell.length > 0 || sub.value_tags_buy.length > 0) && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex flex-wrap gap-1">
            {sub.value_tags_sell.map((t) => (
              <span
                key={t}
                className="chip bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {sub.value_tags_buy.map((t) => (
              <span
                key={t}
                className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SwapRow({ swap }: { swap: Swap }) {
  const headline =
    swap.sell_issuer && swap.buy_issuer
      ? `SELL ${swap.sell_issuer} → BUY ${swap.buy_issuer}`
      : swap.buy_issuer
      ? `BUY ${swap.buy_issuer}`
      : swap.sell_issuer
      ? `DIVEST ${swap.sell_issuer}`
      : swap.industry_group ?? "Position adjustment";

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={swap.action} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {swap.sell_issuer && (
            <IssuerLogo issuer={swap.sell_issuer} isin={swap.sell_isin} size="sm" />
          )}
          {swap.sell_issuer && swap.buy_issuer && (
            <span className="text-slate-400" aria-hidden>
              →
            </span>
          )}
          {swap.buy_issuer && (
            <IssuerLogo issuer={swap.buy_issuer} isin={swap.buy_isin} size="sm" />
          )}
          <span className="text-sm font-semibold text-ink">{headline}</span>
        </div>
        <span className="ml-auto text-sm font-semibold text-ink">
          {chf(swap.amount_chf)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {swap.drift_safe ? (
          <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
            ✓ Drift-safe
          </span>
        ) : (
          <span className="chip bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
            Minor drift
          </span>
        )}
        {swap.same_sector && (
          <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
            Same sector{swap.industry_group ? ` · ${swap.industry_group}` : ""}
          </span>
        )}
        {swap.buy_live_price != null && (
          <span
            className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
            title={
              swap.buy_live_ts
                ? `SIX EOD · ${prettyDate(swap.buy_live_ts)}`
                : "Live SIX price"
            }
          >
            ● {swap.buy_issuer ? `${swap.buy_issuer} @ ` : "Live "}
            {price(swap.buy_live_price, swap.buy_live_ccy)}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {swap.rationale}
      </p>

      {swap.substitution && <SubstitutionTable sub={swap.substitution} />}

      {swap.provenance.length > 0 && (
        <div className="mt-3">
          <Expander label="View sources" count={swap.provenance.length}>
            <ProvenanceList items={swap.provenance} />
          </Expander>
        </div>
      )}
    </div>
  );
}

function GoodNewsBriefingCard({ briefing }: { briefing: GoodNewsBriefing }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <span className="chip bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 font-semibold">
        ✦ Good news briefing
      </span>
      <p className="mt-2 text-sm font-semibold text-ink">{briefing.headline}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {briefing.why_authentic}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {briefing.action_summary}
      </p>
      {briefing.provenance.length > 0 && (
        <div className="mt-3">
          <Expander label="View sources" count={briefing.provenance.length}>
            <ProvenanceList items={briefing.provenance} />
          </Expander>
        </div>
      )}
    </div>
  );
}

export function StrategyPanel({
  proposal,
}: {
  proposal: StrategyProposal | null;
}) {
  return (
    <section className="card flex flex-col">
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Strategy proposal
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
          {proposal?.headline ?? "No strategy action for this client."}
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {proposal?.good_news_briefing && (
          <GoodNewsBriefingCard briefing={proposal.good_news_briefing} />
        )}
        {!proposal || proposal.swaps.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing to propose — the current portfolio stays within mandate and
            values.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {proposal.swaps.map((s, i) => (
                <SwapRow key={`${s.action}-${i}`} swap={s} />
              ))}
            </div>

            {proposal.constraints_checked.length > 0 && (
              <Expander
                label="Constraints checked"
                count={proposal.constraints_checked.length}
              >
                <ul className="space-y-1.5">
                  {proposal.constraints_checked.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-ink-soft"
                    >
                      <span className="mt-0.5 text-emerald-600">✓</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </Expander>
            )}
          </>
        )}
      </div>

      {proposal && proposal.swaps.length > 0 && (
        <footer className="border-t border-slate-200 px-5 py-4">
          <ConfirmGate
            action="Propose to client (RM approve)"
            confirmQuestion="Approve this proposal for the client conversation?"
            approvedLabel="✓ Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}
