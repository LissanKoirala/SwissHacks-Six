"use client";

import { useEffect, useState } from "react";
import type { ClientDetail } from "@/lib/types";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { Provenance } from "./Provenance";

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
    return <p className="p-5 text-sm text-muted-foreground">Loading profile…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600 dark:text-rose-400">Could not load profile: {error}</p>
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

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {keys.map((k) => (
        <section key={k} className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
            {titleCase(k)}
          </h3>
          <div className="space-y-3">
            {facets[k].map((entry, i) => (
              <div key={i}>
                <p className="mb-1.5 text-sm leading-relaxed text-foreground">
                  {entry.text}
                </p>
                <Provenance prov={entry.provenance} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {keys.length === 0 && (
        <p className="text-sm text-muted-foreground">No profile facets recorded.</p>
      )}
    </div>
  );
}
