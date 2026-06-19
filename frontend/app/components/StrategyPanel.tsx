"use client";

import type { StrategyProposal, Swap, SwapAction } from "@/lib/types";
import { chf } from "@/lib/format";
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
        <span className="text-sm font-semibold text-ink">{headline}</span>
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
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
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
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Strategy proposal
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
          {proposal?.headline ?? "No strategy action for this client."}
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
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
