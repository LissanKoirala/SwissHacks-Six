"use client";

import { ArrowRight, Check, CircleDot, Sparkles } from "lucide-react";
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
  SWAP: "bg-primary/10 text-primary ring-primary/30",
  INCREASE: "bg-success/10 text-success ring-success/20",
  HOLD: "bg-muted text-muted-foreground ring-border",
  DIVEST: "bg-destructive/10 text-destructive ring-destructive/20",
  REDUCE: "bg-warning/10 text-warning ring-warning/20",
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
    <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Substitution metrics
        </span>
        {sub.sector_match && (
          <span className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20">
            <Check className="h-3.5 w-3.5" />
            Same sector
          </span>
        )}
        {sub.vol_delta != null && (
          <span
            className={`chip ring-1 ring-inset ${
              Math.abs(sub.vol_delta) <= 0.05
                ? "bg-success/10 text-success ring-success/20"
                : "bg-warning/10 text-warning ring-warning/20"
            }`}
          >
            Risk Δ {sub.vol_delta >= 0 ? "+" : ""}
            <span className="tabular-nums">
              {(sub.vol_delta * 100).toFixed(1)}pp
            </span>
          </span>
        )}
        {sub.risk_source && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            risk: {sub.risk_source}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-medium tracking-wide text-muted-foreground">
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
            <tr key={r.label} className="border-t border-border/60">
              <td className="py-1 text-muted-foreground">{r.label}</td>
              <td className="py-1 text-right tabular-nums text-foreground/80">
                {r.sell}
              </td>
              <td
                className={`py-1 text-right tabular-nums ${
                  r.flag ? "text-warning" : "text-foreground"
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
                className="chip bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {sub.value_tags_buy.map((t) => (
              <span
                key={t}
                className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20"
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
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={swap.action} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {swap.sell_issuer && (
            <IssuerLogo issuer={swap.sell_issuer} isin={swap.sell_isin} size="sm" />
          )}
          {swap.sell_issuer && swap.buy_issuer && (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          )}
          {swap.buy_issuer && (
            <IssuerLogo issuer={swap.buy_issuer} isin={swap.buy_isin} size="sm" />
          )}
          <span className="text-sm font-semibold text-foreground">{headline}</span>
        </div>
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
          {chf(swap.amount_chf)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {swap.drift_safe ? (
          <span className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20">
            <Check className="h-3.5 w-3.5" />
            Drift-safe
          </span>
        ) : (
          <span className="chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/20">
            Minor drift
          </span>
        )}
        {swap.same_sector && (
          <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            Same sector{swap.industry_group ? ` · ${swap.industry_group}` : ""}
          </span>
        )}
        {swap.buy_live_price != null && (
          <span
            className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20"
            title={
              swap.buy_live_ts
                ? `SIX EOD · ${prettyDate(swap.buy_live_ts)}`
                : "Live SIX price"
            }
          >
            <CircleDot className="h-3.5 w-3.5" />
            {swap.buy_issuer ? `${swap.buy_issuer} @ ` : "Live "}
            <span className="tabular-nums">
              {price(swap.buy_live_price, swap.buy_live_ccy)}
            </span>
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground/80">
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
    <div className="rounded-lg border border-success/20 bg-success/[0.06] p-4">
      <span className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20 font-semibold">
        <Sparkles className="h-3.5 w-3.5" />
        Good news briefing
      </span>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {briefing.headline}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
        {briefing.why_authentic}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
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
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Strategy Proposal
        </p>
        <h2 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          {proposal?.headline ?? "No strategy action for this client."}
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {proposal?.good_news_briefing && (
          <GoodNewsBriefingCard briefing={proposal.good_news_briefing} />
        )}
        {!proposal || proposal.swaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
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
                      className="flex items-start gap-2 text-sm text-foreground/80"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
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
        <footer className="border-t border-border px-5 py-4">
          <ConfirmGate
            action="Propose to client (RM approve)"
            confirmQuestion="Approve this proposal for the client conversation?"
            approvedLabel="Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}
