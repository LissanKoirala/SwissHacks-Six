// Thin client for the Advisory Workbench FastAPI backend.
// All calls run client-side (in the browser); never at build/SSR time.

import type {
  ClientSummary,
  Insights,
  Portfolio,
  ClientDetail,
  IntegrationHealth,
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

export const api = {
  clients: () => get<ClientSummary[]>("/clients"),
  insights: (id: string) => get<Insights>(`/clients/${id}/insights`),
  portfolio: (id: string) => get<Portfolio>(`/clients/${id}/portfolio`),
  client: (id: string) => get<ClientDetail>(`/clients/${id}`),
  integrations: () => get<IntegrationHealth>("/api/health/integrations"),
};
