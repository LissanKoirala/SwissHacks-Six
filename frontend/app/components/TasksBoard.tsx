"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientSummary } from "@/lib/types";
import { ClientAvatar } from "./ClientAvatar";

/* ----------------------------------------------------------------- model --- */

type TaskStatus = "backlog" | "started" | "in-progress" | "completed";
type TaskPriority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  notes?: string;
  clientId?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
}

const STORAGE_KEY = "aw.tasks.v1";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "started", label: "Started" },
  { id: "in-progress", label: "In-progress" },
  { id: "completed", label: "Completed" },
];

const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  low: { label: "Low", cls: "bg-slate-50 text-slate-600 ring-slate-200" },
};

/* ------------------------------------------------------------------ seed --- */

function makeId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function seedTasks(clients: ClientSummary[]): Task[] {
  const byName = (needle: string): string | null =>
    clients.find((c) => c.name.toLowerCase().includes(needle.toLowerCase()))
      ?.client_id ?? null;

  const now = Date.now();
  const seeds: Omit<Task, "id" | "createdAt">[] = [
    {
      title: "Review pharma conflict with Schneider",
      notes: "Foundation funds research the pharma firm is shutting down.",
      clientId: byName("Schneider"),
      priority: "high",
      status: "backlog",
    },
    {
      title: "Schedule quarterly review calls",
      notes: "Book Q3 catch-ups across the book.",
      clientId: null,
      priority: "low",
      status: "backlog",
    },
    {
      title: "Prepare palm-oil dialogue for Huber",
      notes: "Consumer-goods firm announced a deforestation cut-off.",
      clientId: byName("Huber"),
      priority: "medium",
      status: "started",
    },
    {
      title: "Draft US-AI rebalance memo — Räber",
      notes: "CIO suggests blue chips → US AI; client is US-tech averse.",
      clientId: byName("Räber"),
      priority: "high",
      status: "in-progress",
    },
    {
      title: "Confirm labour-scandal swap — Ammann",
      notes: "Labour-exploitation scandal hit a portfolio consumer brand.",
      clientId: byName("Ammann"),
      priority: "medium",
      status: "in-progress",
    },
    {
      title: "Send Q2 portfolio summary",
      clientId: null,
      priority: "low",
      status: "completed",
    },
  ];

  return seeds.map((s, i) => ({
    ...s,
    id: makeId(),
    createdAt: now + i,
  }));
}

/* ------------------------------------------------------------- component --- */

export function TasksBoard({ clients }: { clients: ClientSummary[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null);

  // Load once on mount — never touch localStorage during render (SSR-safe).
  useEffect(() => {
    let loaded: Task[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Task[];
        if (Array.isArray(parsed)) loaded = parsed;
      }
    } catch {
      loaded = null;
    }
    setTasks(loaded && loaded.length > 0 ? loaded : seedTasks(clients));
    setHydrated(true);
    // clients is only used for the initial seed; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change, once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [tasks, hydrated]);

  const clientName = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.client_id, c.name));
    return m;
  }, [clients]);

  function moveTask(id: string, status: TaskStatus) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function addTask(
    status: TaskStatus,
    draft: Omit<Task, "id" | "createdAt" | "status">
  ) {
    setTasks((prev) => [
      ...prev,
      { ...draft, id: makeId(), createdAt: Date.now(), status },
    ]);
    setAddingTo(null);
  }

  function onDrop(status: TaskStatus) {
    if (draggingId) moveTask(draggingId, status);
    setDraggingId(null);
    setDragOver(null);
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* header */}
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">Tasks</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Shared board across all clients — drag cards between columns.
          </p>
        </header>

        {/* board */}
        <div className="scroll-thin flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks
              .filter((t) => t.status === col.id)
              .sort((a, b) => a.createdAt - b.createdAt);
            const over = dragOver === col.id;
            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== col.id) setDragOver(col.id);
                }}
                onDragLeave={(e) => {
                  // only clear when leaving the column itself
                  if (e.currentTarget === e.target) setDragOver(null);
                }}
                onDrop={() => onDrop(col.id)}
                className={`flex min-w-[18rem] flex-1 flex-col rounded-xl border bg-slate-100/60 p-3 transition-colors ${
                  over
                    ? "border-primary/40 ring-2 ring-inset ring-primary/30"
                    : "border-slate-200"
                }`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-ink">{col.label}</h2>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2.5">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      clientName={
                        task.clientId
                          ? clientName.get(task.clientId) ?? null
                          : null
                      }
                      dragging={draggingId === task.id}
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOver(null);
                      }}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}

                  {colTasks.length === 0 && addingTo !== col.id && (
                    <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                      No tasks
                    </p>
                  )}
                </div>

                {/* footer: add affordance */}
                {addingTo === col.id ? (
                  <AddTaskForm
                    clients={clients}
                    onCancel={() => setAddingTo(null)}
                    onAdd={(draft) => addTask(col.id, draft)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTo(col.id)}
                    className="mt-2.5 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:border-primary/40 hover:bg-white hover:text-primary"
                  >
                    ＋ Add task
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ card --- */

function TaskCard({
  task,
  clientName,
  dragging,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  task: Task;
  clientName: string | null;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
}) {
  const pri = PRIORITY_META[task.priority];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group card cursor-grab p-3 active:cursor-grabbing ${
        dragging ? "opacity-50 shadow-pop" : "hover:shadow-pop"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-ink">
          {task.title}
        </p>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete task"
          className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-rose-600 group-hover:opacity-100"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {task.notes && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {task.notes}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className={`chip ring-1 ring-inset ${pri.cls}`}>{pri.label}</span>
        {task.clientId && (
          <span className="ml-auto flex items-center gap-1.5">
            <ClientAvatar
              clientId={task.clientId}
              name={clientName ?? ""}
              size="sm"
              className="!h-6 !w-6 !text-[10px] !ring-1"
            />
            <span className="text-xs text-slate-500">{clientName}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- add form --- */

function AddTaskForm({
  clients,
  onAdd,
  onCancel,
}: {
  clients: ClientSummary[];
  onAdd: (draft: Omit<Task, "id" | "createdAt" | "status">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  function submit() {
    const t = title.trim();
    if (!t) return;
    onAdd({
      title: t,
      notes: notes.trim() || undefined,
      clientId: clientId || null,
      priority,
    });
  }

  return (
    <div className="card mt-2.5 space-y-2 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task title"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-ink-soft outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex gap-2">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-ink-soft outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        >
          <option value="">— No client —</option>
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-ink-soft outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-0.5">
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5 !text-xs">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          className="btn-primary !py-1.5 !text-xs"
        >
          Add
        </button>
      </div>
    </div>
  );
}
