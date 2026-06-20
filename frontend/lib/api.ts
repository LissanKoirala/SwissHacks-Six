// Thin client for the Advisory Workbench FastAPI backend.
// All calls run client-side (in the browser); never at build/SSR time.

import type {
  ClientSummary,
  Insights,
  Portfolio,
  ClientDetail,
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
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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
  clients: () => get<ClientSummary[]>("/clients"),
  insights: (id: string) => get<Insights>(`/clients/${id}/insights`),
  portfolio: (id: string) => get<Portfolio>(`/clients/${id}/portfolio`),
  client: (id: string) => get<ClientDetail>(`/clients/${id}`),
  analytics: (id: string) => get<Analytics>(`/clients/${id}/analytics`),
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
