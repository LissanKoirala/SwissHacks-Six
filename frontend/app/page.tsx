"use client";

import { useEffect, useState } from "react";
import type { ClientSummary, IntegrationHealth } from "@/lib/types";
import { api } from "@/lib/api";
import { Sidebar } from "./components/Sidebar";
import { ClientView } from "./components/ClientView";

export default function Home() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .clients()
      .then((cs) => {
        if (!alive) return;
        setClients(cs);
        if (cs.length > 0) setSelectedId(cs[0].client_id);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));

    // Integration health is best-effort; never block the UI on it.
    api
      .integrations()
      .then((h) => alive && setHealth(h))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        clients={clients}
        selectedId={selectedId}
        onSelect={setSelectedId}
        health={health}
      />
      <div className="flex-1 overflow-hidden bg-slate-50">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            Loading clients…
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <p className="text-sm font-medium text-rose-600">
                Could not load the client list.
              </p>
              <p className="mt-1 text-xs text-slate-500">{error}</p>
              <p className="mt-2 text-xs text-slate-400">
                Start the backend on http://localhost:8000, then reload.
              </p>
            </div>
          </div>
        ) : selectedId ? (
          <ClientView clientId={selectedId} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            Select a client to begin.
          </div>
        )}
      </div>
    </main>
  );
}
