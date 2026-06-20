"use client";

import { useEffect, useState } from "react";
import type { ClientSummary, IntegrationHealth, MeUser } from "@/lib/types";
import { api } from "@/lib/api";
import { Sidebar } from "./components/Sidebar";
import { ClientView } from "./components/ClientView";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { TasksBoard } from "./components/TasksBoard";
import { WorkspacePanel } from "./components/WorkspacePanel";

type View = "overview" | "client" | "tasks" | "workspace";

export default function Home() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Gate the desk on Google sign-in: an unauthenticated first visit is sent straight to the Google
  // login, returning here after consent. If Google isn't configured we fall through to the open
  // seed demo so local dev still works.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [me, cfg] = await Promise.all([
        api.me().catch(() => null),
        api.authConfig().catch(() => null),
      ]);
      if (!alive) return;
      if (!me && cfg?.google_enabled) {
        window.location.href = api.loginUrl(); // keep the loading screen during navigation
        return;
      }
      setUser(me);
      setAuthReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load the desk only once auth is resolved (and we're staying on the page).
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    api
      .clients()
      .then((cs) => alive && setClients(cs))
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
  }, [authReady]);

  const openClient = (id: string) => {
    setSelectedId(id);
    setView("client");
  };

  if (!authReady) {
    return (
      <main className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
        Signing in…
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        clients={clients}
        selectedId={view === "client" ? selectedId : null}
        onSelect={openClient}
        onHome={() => setView("overview")}
        overviewActive={view === "overview"}
        health={health}
        onShowTasks={() => setView("tasks")}
        tasksActive={view === "tasks"}
        onShowWorkspace={() => setView("workspace")}
        workspaceActive={view === "workspace"}
      />
      <div className="flex-1 overflow-hidden bg-background">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading clients…
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <p className="text-sm font-medium text-destructive">
                Could not load the client list.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Start the backend on http://localhost:8000, then reload.
              </p>
            </div>
          </div>
        ) : view === "tasks" ? (
          <TasksBoard clients={clients} />
        ) : view === "workspace" ? (
          <WorkspacePanel />
        ) : view === "client" && selectedId ? (
          <ClientView clientId={selectedId} />
        ) : (
          <OverviewDashboard onOpenClient={openClient} user={user} />
        )}
      </div>
    </main>
  );
}
