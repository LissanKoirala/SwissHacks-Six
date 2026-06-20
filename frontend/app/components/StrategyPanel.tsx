"use client";

import type { StrategyProposal, Swap, SwapAction } from "@/lib/types";
import { chf, price, prettyDate } from "@/lib/format";
import { IssuerLogo } from "./IssuerLogo";
import { Expander } from "./ui";
import { ProvenanceList } from "./Provenance";
import { ConfirmGate } from "./ConfirmGate";

const ACTION_META: Record<SwapAction, string> = {
  SWAP: "bg-primary/10 text-primary ring-primary/30",
  INCREASE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  HOLD: "bg-muted text-muted-foreground ring-border",
  DIVEST: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  REDUCE: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
};

function ActionChip({ action }: { action: SwapAction }) {
  const cls = ACTION_META[action] ?? ACTION_META.HOLD;
  return (
    <span className={`chip ring-1 ring-inset ${cls} font-semibold`}>
      {action}
    </span>
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
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={swap.action} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {swap.sell_issuer && (
            <IssuerLogo issuer={swap.sell_issuer} isin={swap.sell_isin} size="sm" />
          )}
          {swap.sell_issuer && swap.buy_issuer && (
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
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
          <span className="chip bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            ✓ Drift-safe
          </span>
        ) : (
          <span className="chip bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
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
            className="chip bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
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

      <p className="mt-3 text-sm leading-relaxed text-foreground/80">
        {swap.rationale}
      </p>

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

export function StrategyPanel({
  proposal,
}: {
  proposal: StrategyProposal | null;
}) {
  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Strategy proposal
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-foreground/80">
          {proposal?.headline ?? "No strategy action for this client."}
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
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
                      <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
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
            approvedLabel="✓ Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}
