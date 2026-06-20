// Thin client for the Advisory Workbench FastAPI backend.
// All calls run client-side (in the browser); never at build/SSR time.

import type {
  ClientSummary,
  Insights,
  Portfolio,
  ClientDetail,
  Fundamentals,
  IntegrationHealth,
  Analytics,
  CrmGraph,
  Rendezvous,
  CandidateFlightQuotes,
  Decision,
  Globe,
  RiskTimeline,
  CaptureDraft,
  CaptureExtractBody,
  CaptureConfirm,
  CaptureResult,
  CapturePrompts,
  CaptureFollowup,
  CaptureFollowupBody,
  Overview,
  Opportunity,
  PortfolioAudit,
  BreakingFeed,
  TransactionsData,
  RMQueryBody,
  RMQueryResult,
  MatchResolution,
  LinkPreview,
  MeUser,
  BriefingPrefsBody,
  BriefingPrefsResult,
  SendTestResult,
  AuthConfig,
  GmailMessage,
  CalendarEvent,
  DraftBody,
  DraftResult,
  EventBody,
  AddEventResult,
  ClientInbox,
  ClientCalendar,
  ClientDraftBody,
  Task,
  TaskCreateBody,
  TaskUpdateBody,
  TaskSignoffBody,
  IngestResult,
  EmailMessage,
} from "./types";

// Default to 127.0.0.1 (not "localhost"): on macOS "localhost" can resolve to IPv6 ::1 first,
// where a backend bound to IPv4 0.0.0.0/127.0.0.1 isn't listening — the fetch then hangs.
// Override with NEXT_PUBLIC_API_BASE for non-local backends.
// Unset → the local dev backend. Empty string ("") → same-origin relative
// requests, so a reverse-proxied / tunnelled deploy can route /clients, /api,
// … to the backend on its own origin (see next.config rewrites).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE === undefined
    ? "http://127.0.0.1:8000"
    : process.env.NEXT_PUBLIC_API_BASE;

// credentials:"include" — carry the signed session cookie on /auth + /briefing calls.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — GET ${path}`);
  }
  return (await res.json()) as T;
}

async function send<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${method} ${path}`);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => send<T>("POST", path, body);
const put = <T>(path: string, body: unknown) => send<T>("PUT", path, body);

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — PATCH ${path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  overview: () => get<Overview>("/overview"),
  clients: () => get<ClientSummary[]>("/clients"),
  insights: (id: string) => get<Insights>(`/clients/${id}/insights`),
  portfolio: (id: string) => get<Portfolio>(`/clients/${id}/portfolio`),
  fundamentals: (id: string) =>
    get<Fundamentals[]>(`/clients/${id}/fundamentals`),
  client: (id: string) => get<ClientDetail>(`/clients/${id}`),
  analytics: (id: string) => get<Analytics>(`/clients/${id}/analytics`),
  opportunities: (id: string) =>
    get<Opportunity[]>(`/clients/${id}/opportunities`),
  audit: (id: string) => get<PortfolioAudit>(`/clients/${id}/audit`),
  breaking: () => get<BreakingFeed>("/breaking"),
  transactions: (id: string) =>
    get<TransactionsData>(`/clients/${id}/transactions`),
  graph: (id: string) => get<CrmGraph>(`/clients/${id}/graph`),
  rendezvous: (
    id: string,
    opts?: { mode?: "fairness" | "environmental"; eventStart?: string },
  ) => {
    const q = new URLSearchParams();
    if (opts?.mode) q.set("mode", opts.mode);
    if (opts?.eventStart) q.set("event_start", opts.eventStart);
    const qs = q.toString();
    return get<Rendezvous>(`/clients/${id}/rendezvous${qs ? `?${qs}` : ""}`);
  },
  rendezvousFlightQuotes: (
    id: string,
    iata: string,
    opts?: { eventStart?: string },
  ) => {
    const q = new URLSearchParams({ iata });
    if (opts?.eventStart) q.set("event_start", opts.eventStart);
    return get<CandidateFlightQuotes>(
      `/clients/${id}/rendezvous/flight-quotes?${q.toString()}`,
    );
  },
  decision: (id: string) => get<Decision>(`/clients/${id}/decision`),
  globe: (id: string) => get<Globe>(`/clients/${id}/globe`),
  riskTimeline: (id: string) =>
    get<RiskTimeline>(`/clients/${id}/risk-timeline`),
  captureExtract: (id: string, body: CaptureExtractBody) =>
    post<CaptureDraft>(`/clients/${id}/capture/extract`, body),
  captureConfirm: (id: string, body: CaptureConfirm) =>
    post<CaptureResult>(`/clients/${id}/capture/confirm`, body),
  capturePrompts: (id: string) =>
    get<CapturePrompts>(`/clients/${id}/capture/prompts`),
  captureFollowup: (id: string, body: CaptureFollowupBody) =>
    post<CaptureFollowup>(`/clients/${id}/capture/followup`, body),
  query: (id: string, body: RMQueryBody) =>
    post<RMQueryResult>(`/clients/${id}/query`, body),
  matchResolution: (id: string, matchId: string, holdingIsin?: string | null, refresh = false) =>
    post<MatchResolution>(`/clients/${id}/matches/resolution`, {
      match_id: matchId,
      holding_isin: holdingIsin ?? null,
      refresh,
    }),
  linkPreview: (url: string) =>
    get<LinkPreview>(`/api/link-preview?url=${encodeURIComponent(url)}`),
  integrations: () => get<IntegrationHealth>("/api/health/integrations"),

  // --- auth (Google sign-in, identity only) + Twilio morning briefing ---
  me: () => get<MeUser | null>("/auth/me"),
  authConfig: () => get<AuthConfig>("/auth/config"),
  loginUrl: () => `${API_BASE}/auth/google/login`,
  logout: () => post<{ ok: boolean }>("/auth/logout", {}),
  briefingPreview: () => get<{ text: string }>("/briefing/preview"),
  updateBriefing: (body: BriefingPrefsBody) =>
    put<BriefingPrefsResult>("/me/briefing", body),
  sendTestBriefing: () => post<SendTestResult>("/briefing/send-test", {}),

  // --- Google Workspace (Gmail read/draft + Calendar read/add) ---
  gmailInbox: () => get<{ messages: GmailMessage[] }>("/integrations/google/inbox"),
  gmailDraft: (body: DraftBody) =>
    post<DraftResult>("/integrations/google/draft", body),
  calendarEvents: () =>
    get<{ events: CalendarEvent[] }>("/integrations/google/calendar"),
  addCalendarEvent: (body: EventBody) =>
    post<AddEventResult>("/integrations/google/calendar", body),

  // --- Per-client Workspace (Gmail/Calendar scoped to one client by their email) ---
  clientInbox: (id: string) =>
    get<ClientInbox>(`/clients/${id}/workspace/inbox`),
  clientCalendar: (id: string) =>
    get<ClientCalendar>(`/clients/${id}/workspace/calendar`),
  clientDraft: (id: string, body: ClientDraftBody) =>
    post<DraftResult>(`/clients/${id}/workspace/draft`, body),

  // --- The Front Door: inbox + agentic kanban board ---
  tasks: (clientId?: string) =>
    get<Task[]>(`/tasks${clientId ? `?client_id=${clientId}` : ""}`),
  inbox: () => get<EmailMessage[]>("/inbox"),
  createTask: (body: TaskCreateBody) => post<Task>("/tasks", body),
  updateTask: (id: string, body: TaskUpdateBody) =>
    patch<Task>(`/tasks/${id}`, body),
  runTask: (id: string) => post<Task>(`/tasks/${id}/execute`, {}),
  signoffTask: (id: string, body: TaskSignoffBody) =>
    post<Task>(`/tasks/${id}/signoff`, body),
  dismissTask: (id: string) => post<Task>(`/tasks/${id}/dismiss`, {}),
  ingestEmail: () => post<IngestResult>("/ingest/email", {}),
  ingestNews: () => post<IngestResult>("/ingest/news", {}),
  ocr: async (image: Blob, filename = "note.png"): Promise<{ text: string; provider: string; model?: string }> => {
    const form = new FormData();
    form.append("file", image, filename);
    const res = await fetch(`${API_BASE}/api/ocr`, { method: "POST", body: form, cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} — POST /api/ocr ${detail}`);
    }
    return (await res.json()) as { text: string; provider: string; model?: string };
  },
  tts: async (text: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} — POST /api/tts ${detail}`);
    }
    return res.blob();
  },
  transcribe: async (audio: Blob, filename = "audio.webm"): Promise<{ text: string; provider: string }> => {
    const form = new FormData();
    form.append("file", audio, filename);
    const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: form, cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} — POST /api/transcribe ${detail}`);
    }
    return (await res.json()) as { text: string; provider: string };
  },
};
