"use client";

import { useEffect, useState } from "react";
import type { ClientSummary, IntegrationHealth, MeUser } from "@/lib/types";
import { api } from "@/lib/api";
import { Sidebar } from "./components/Sidebar";
import { ClientView } from "./components/ClientView";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { TasksBoard } from "./components/TasksBoard";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { NewsView } from "./components/NewsView";

type View = "overview" | "client" | "tasks" | "workspace" | "news";

export default function Home() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .clients()
      .then((cs) => {
        if (!alive) return;
        setClients(cs);
        // default landing is the Overview, per the desk philosophy
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));

    // Integration health is best-effort; never block the UI on it.
    api
      .integrations()
      .then((h) => alive && setHealth(h))
      .catch(() => {});

    // Sign-in is optional — fetch the RM in the background only to personalise the greeting.
    // No gate, no redirect: the desk works logged-out on seed data.
    api
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const openClient = (id: string) => {
    setSelectedId(id);
    setView("client");
  };

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
        onShowNews={() => setView("news")}
        newsActive={view === "news"}
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
        ) : view === "news" ? (
          <NewsView />
        ) : view === "client" && selectedId ? (
          <ClientView clientId={selectedId} />
        ) : (
          <OverviewDashboard onOpenClient={openClient} user={user} />
        )}
      </div>
    </main>
  );
}
