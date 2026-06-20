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
  Decision,
  Globe,
  RiskTimeline,
  CaptureDraft,
  CaptureExtractBody,
  CaptureConfirm,
  CaptureResult,
  CapturePrompts,
  Overview,
  Opportunity,
  TransactionsData,
  RMQueryBody,
  RMQueryResult,
} from "./types";

// Default to 127.0.0.1 (not "localhost"): on macOS "localhost" can resolve to IPv6 ::1 first,
// where a backend bound to IPv4 0.0.0.0/127.0.0.1 isn't listening — the fetch then hangs.
// Override with NEXT_PUBLIC_API_BASE for non-local backends.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — GET ${path}`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — POST ${path}`);
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
  transactions: (id: string) =>
    get<TransactionsData>(`/clients/${id}/transactions`),
  graph: (id: string) => get<CrmGraph>(`/clients/${id}/graph`),
  rendezvous: (id: string) => get<Rendezvous>(`/clients/${id}/rendezvous`),
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
  query: (id: string, body: RMQueryBody) =>
    post<RMQueryResult>(`/clients/${id}/query`, body),
  integrations: () => get<IntegrationHealth>("/api/health/integrations"),
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
