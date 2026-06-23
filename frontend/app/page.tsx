"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import type { ClientSummary, IntegrationHealth, MeUser } from "@/lib/types";
import { api } from "@/lib/api";
import { Sidebar } from "./components/Sidebar";
import { ClientView } from "./components/ClientView";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { TasksBoard } from "./components/TasksBoard";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { NewsView } from "./components/NewsView";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MAIN_CONTENT_TOP_PADDING } from "@/lib/layout";
import { cn } from "@/lib/utils";

type View = "overview" | "client" | "tasks" | "workspace" | "news";

const VIEW_TITLE: Record<Exclude<View, "client">, string> = {
  overview: "Overview",
  tasks: "Tasks board",
  workspace: "Workspace",
  news: "News feed",
};

export default function Home() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  // Mobile-only: the sidebar collapses into a slide-in drawer behind a hamburger.
  const [navOpen, setNavOpen] = useState(false);

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

  // Shared between the persistent desktop rail and the mobile slide-in drawer.
  const sidebarProps = {
    clients,
    selectedId: view === "client" ? selectedId : null,
    onSelect: openClient,
    onHome: () => setView("overview"),
    overviewActive: view === "overview",
    health,
    onShowTasks: () => setView("tasks"),
    tasksActive: view === "tasks",
    onShowWorkspace: () => setView("workspace"),
    workspaceActive: view === "workspace",
    onShowNews: () => setView("news"),
    newsActive: view === "news",
  };

  const selectedClient = clients.find((c) => c.client_id === selectedId);
  const mobileTitle =
    view === "client"
      ? selectedClient?.name ?? "Client"
      : VIEW_TITLE[view];
  const totalAlerts = clients.reduce((s, c) => s + (c.alert_count || 0), 0);

  return (
    <main className="flex h-screen overflow-hidden">
      {/* Persistent rail — desktop only. */}
      <Sidebar {...sidebarProps} className="hidden lg:flex" />

      {/* Mobile drawer — the same rail behind a hamburger, dismisses on navigate. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="w-[17rem] max-w-[85vw] border-r-0 p-0 lg:hidden"
        >
          <Sidebar
            {...sidebarProps}
            className="w-full border-r-0"
            onNavigate={() => setNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar — hamburger + current view title. Hidden on desktop. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label={`Open navigation${totalAlerts > 0 ? `, ${totalAlerts} alerts` : ""}`}
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
            {totalAlerts > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold leading-none text-white">
                {totalAlerts}
              </span>
            )}
          </button>
          <span className="truncate text-sm font-semibold text-foreground">
            {mobileTitle}
          </span>
        </header>

        <div className={cn("flex-1 overflow-hidden bg-background", MAIN_CONTENT_TOP_PADDING)}>
          {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading clients…
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center px-4 text-center sm:px-8">
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
      </div>
    </main>
  );
}
