"use client";

import { useEffect, useState } from "react";
import type { ClientDetail } from "@/lib/types";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { ProvenanceTag } from "./Provenance";
import { LinkPreviewThumb } from "./LinkPreviewThumb";
import { MandatePill } from "./ui";

const FACET_ORDER = ["professional", "interests", "historical", "personality"];

export function ProfileView({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .client(clientId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        Loading client profile from the CRM graph…
      </p>
    );
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-destructive">
        Could not load profile: {error}
      </p>
    );
  }
  if (!data) return null;

  const facets = data.profile.facets ?? {};
  const keys = [
    ...FACET_ORDER.filter((k) => facets[k]?.length),
    ...Object.keys(facets).filter(
      (k) => !FACET_ORDER.includes(k) && facets[k]?.length
    ),
  ];

  const name = data.profile.name;
  const mandate = data.profile.mandate || data.mandate;
  const headline = data.profile.headline;
  const factCount = keys.reduce((n, k) => n + (facets[k]?.length ?? 0), 0);
  // One-line digest of what the profile holds, reusing existing data only.
  const digest =
    keys.length > 0
      ? `${factCount} ${factCount === 1 ? "fact" : "facts"} across ${
          keys.length
        } ${keys.length === 1 ? "facet" : "facets"}`
      : null;

  return (
    <div className="space-y-5">
      {keys.length > 0 && (
        <header className="card p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-base font-semibold text-foreground">{name}</h2>
            {mandate && <MandatePill mandate={mandate} />}
            {digest && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {digest}
              </span>
            )}
          </div>
          {headline && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {headline}
            </p>
          )}
        </header>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {keys.map((k) => (
          <section key={k} className="card p-5">
            <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
              {titleCase(k)}
            </h3>
            <div className="space-y-3">
              {facets[k].map((entry, i) => (
                <article
                  key={i}
                  className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3"
                >
                  {entry.provenance.url ? (
                    <LinkPreviewThumb url={entry.provenance.url} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground">
                      {entry.text}
                    </p>
                    <div className="mt-2">
                      <ProvenanceTag prov={entry.provenance} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {keys.length === 0 && (
        <div>
          <h3 className="font-display text-4xl font-light tracking-tight text-foreground">
            No profile yet
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The profile is built from confirmed meeting notes — capture a note
            under Add Note, confirm the extracted facts, and the professional,
            interests, historical and personality facets will populate here.
          </p>
        </div>
      )}
    </div>
  );
}
