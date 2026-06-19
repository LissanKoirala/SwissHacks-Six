// Shared types mirroring the FastAPI backend contract (see CLAUDE.md §7).

export type SourceType =
  | "crm_log"
  | "news"
  | "cio_list"
  | "portfolio"
  | "mandate"
  | "market_digest";

export type Polarity = "conflict" | "opportunity" | "neutral";

export type SwapAction =
  | "SWAP"
  | "INCREASE"
  | "HOLD"
  | "DIVEST"
  | "REDUCE";

export interface Provenance {
  source_type: SourceType;
  source_id: string;
  excerpt: string;
  url?: string | null;
  timestamp?: string | null;
}

export interface Sentiment {
  score: number;
  label: string;
}

export interface NewsItem {
  id: string;
  title: string;
  body?: string;
  source: string;
  url?: string | null;
  published_at: string;
  topics: string[];
  sentiment: Sentiment;
  issuer_name?: string | null;
  issuer_isin?: string | null;
  provenance: Provenance;
}

export interface SharedTopic {
  topic: string;
  client_provenance: Provenance;
  news_provenance: Provenance;
}

export interface Holding {
  portfolio: string;
  asset_class: string;
  sub_asset_class: string;
  region: string;
  industry_group: string;
  issuer: string;
  security: string;
  isin: string;
  target_chf: number;
  current_chf: number;
  valor?: string | null;
  mic?: string | null;
  yahoo?: string | null;
}

export interface Match {
  id: string;
  client_id: string;
  polarity: Polarity;
  headline: string;
  news: NewsItem;
  shared_topics: SharedTopic[];
  affected_holding?: Holding | null;
  why: Provenance[];
}

export interface Swap {
  action: SwapAction;
  sell_isin?: string | null;
  sell_issuer?: string | null;
  buy_isin?: string | null;
  buy_issuer?: string | null;
  industry_group?: string | null;
  same_sector: boolean;
  amount_chf: number;
  rationale: string;
  drift_safe: boolean;
  provenance: Provenance[];
}

export interface StrategyProposal {
  client_id: string;
  headline: string;
  polarity: Polarity;
  swaps: Swap[];
  constraints_checked: string[];
  provenance: Provenance[];
}

export interface TalkingPoint {
  text: string;
  provenance: Provenance;
}

export interface MarketContextItem {
  text: string;
  provenance: Provenance;
}

export interface DialogueSuggestion {
  client_id: string;
  style: string;
  talking_points: TalkingPoint[];
  draft_message: string;
  market_context: MarketContextItem[];
  provenance: Provenance[];
}

export interface ClientSummary {
  client_id: string;
  name: string;
  mandate: string;
  headline: string;
  alert_count: number;
}

export interface Insights {
  client: ClientSummary;
  matches: Match[];
  strategy_proposal: StrategyProposal | null;
  dialogue_suggestion: DialogueSuggestion | null;
  generated_at: string;
  llm_used: boolean;
}

export interface MandateTarget {
  asset_class: string;
  sub_asset_class: string;
  benchmark?: string;
  target_pct: number;
  target_chf: number;
  current_chf: number;
  current_pct: number;
  drift_pp: number;
  breach: boolean;
}

export interface Mandate {
  name: string;
  total_chf: number;
  targets: MandateTarget[];
}

export interface Portfolio {
  portfolio: string;
  total_chf: number;
  mandate: Mandate;
  holdings: Holding[];
}

export interface FacetEntry {
  text: string;
  provenance: Provenance;
}

export interface ClientDetail {
  profile: {
    client_id: string;
    name: string;
    mandate: string;
    headline: string;
    facets: Record<string, FacetEntry[]>;
    interest_edges?: unknown[];
  };
  mandate?: string;
  log_count?: number;
}

export interface IntegrationProbe {
  name: string;
  configured: boolean;
  live: boolean;
  mode: string;
}

export interface IntegrationHealth {
  use_live: boolean;
  probes: IntegrationProbe[];
}
