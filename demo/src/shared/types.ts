export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: SentimentAnalysis;
}

export interface SentimentAnalysis {
  score: number;
  magnitude: number;
  label: "BEARISH" | "NEUTRAL" | "BULLISH";
  confidence: number;
}

export interface PortfolioRecommendation {
  symbol: string;
  currentPrice: number;
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
  reasoning: string;
  suggestedAction: "ADD" | "REMOVE" | "MAINTAIN";
  targetPrice?: number;
  stopLoss?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** A captured request/response round-trip for one integration, for the status UI. */
export interface IntegrationProbe {
  name: string;
  configured: boolean;
  ok: boolean;
  durationMs: number;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    status?: number;
    body: string;
  };
  error?: string;
}

export interface AnalysisRequest {
  symbol: string;
  days?: number;
}

// ---- CRM agent layer ----

/** One raw CRM contact-note row. */
export interface CrmInteraction {
  id: string;
  date: string;
  medium: string;
  rm: string;
  contact: string;
  note: string;
}

/** A client household and its contact history. */
export interface CrmClient {
  id: string;
  name: string;
  household: string;
  mandate: "Defensive" | "Balanced" | "Growth" | null;
  contacts: string[];
  interactionCount: number;
  firstContact: string | null;
  lastContact: string | null;
  interactions: CrmInteraction[];
}

/** Where a derived fact came from, so an agent can cite it. */
export interface Provenance {
  interactionId: string;
  date: string;
  quote: string;
}

/** A structured, grounded preference/constraint extracted from the notes. */
export interface Constraint {
  id: string;
  /** EXCLUSION: must avoid · INCLUSION: must favour · RISK: posture · PREFERENCE: soft. */
  kind: "EXCLUSION" | "INCLUSION" | "RISK" | "PREFERENCE";
  text: string;
  /** Concrete signals (industries, asset classes, keywords) this constraint screens on. */
  signals: string[];
  severity: "HARD" | "SOFT";
  source: "rule" | "llm";
  provenance: Provenance[];
}

/** The agent-facing structured view of a client, assembled from the notes. */
export interface ClientProfile {
  clientId: string;
  name: string;
  household: string;
  mandate: CrmClient["mandate"];
  riskPosture: string;
  summary: string;
  constraints: Constraint[];
  preferences: string[];
  themes: string[];
  liquidityEvents: { date: string; text: string; provenance: Provenance }[];
  keyPeople: string[];
  /** True when LLM enrichment ran; false when the profile is rules-only. */
  llmEnriched: boolean;
}

/** One holding evaluated against a client's constraints. */
export interface ComplianceFinding {
  verdict: "VIOLATION" | "WATCH" | "OK";
  issuer: string;
  isin: string;
  industry: string;
  assetClass: string;
  currentCHF: number | null;
  constraintId: string | null;
  reason: string;
  provenance: Provenance[];
}

export interface ComplianceReport {
  clientId: string;
  name: string;
  portfolio: "Defensive" | "Balanced" | "Growth";
  checkedHoldings: number;
  violations: number;
  watches: number;
  exposureAtRiskCHF: number;
  findings: ComplianceFinding[];
  llmAdjudicated: boolean;
}

export interface AnalysisResult {
  stock: StockData;
  news: NewsArticle[];
  sentiment: SentimentAnalysis;
  recommendation: PortfolioRecommendation;
}
