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

// --- analytics (charts + 3D investment globe) ---

export interface AnalyticsFigures {
  total_chf: number;
  holding_count: number;
  sub_asset_classes: number;
  drift_breaches: number;
  alerts: number;
  weighted_sentiment: number;
  regions: number;
}

export interface AllocationSlice {
  name: string;
  current_chf: number;
  pct: number;
}

export interface SubAssetClassRow {
  name: string;
  asset_class: string;
  target_pct: number;
  current_pct: number;
  current_chf: number;
  drift_pp: number;
  breach: boolean;
}

export interface RegionRisk {
  kind: Polarity;
  label: string;
  detail: string;
  sentiment: string;
  issuer?: string | null;
  provenance: Provenance;
}

export interface RegionExposure {
  region: string;
  current_chf: number;
  count: number;
  pct: number;
  lat: number;
  lng: number;
  risk_level: "high" | "positive" | "stable";
  risks: RegionRisk[];
}

export interface TopHolding {
  issuer: string;
  isin: string;
  industry_group: string | null;
  region: string | null;
  current_chf: number;
  pct: number;
  in_alert: boolean;
}

export interface Analytics {
  client_id: string;
  figures: AnalyticsFigures;
  by_asset_class: AllocationSlice[];
  by_sub_asset_class: SubAssetClassRow[];
  by_sector: AllocationSlice[];
  by_region: RegionExposure[];
  top_holdings: TopHolding[];
}

// --- CRM knowledge graph (Network view) ---

export interface CrmNode {
  id: string;
  label: string;
  type: "rm" | "client" | "person" | "medium" | "interaction" | "theme";
  color: string;
  degree: number;
  detail?: string;
  date?: string;
  medium?: string;
  contact?: string;
  summary?: string;
  avatar?: string | null; // "/faces/<slug>.jpg" for person/rm nodes
  icon?: string | null; // emoji for medium/theme/interaction nodes
  first_name?: string | null;
}

export interface CrmLink {
  source: string;
  target: string;
  strength?: number; // 0..1 connection importance → line width/contrast
  recency?: number; // 0..1 (1 = most recent) → line warmth/glow
}

export interface CrmGraph {
  client_id: string;
  nodes: CrmNode[];
  links: CrmLink[];
}

// --- Rendezvous planner (CRM-grounded next-meeting plan) ---

export type RendezvousKind =
  | "dining"
  | "sport"
  | "culture"
  | "outdoor"
  | "family"
  | "philanthropy"
  | "wine"
  | "travel"
  | "other";

export interface RendezvousInterest {
  id: string;
  label: string;
  category: RendezvousKind;
  icon: string;
  provenance?: Provenance | null;
}

export interface RendezvousSuggestion {
  id: string;
  kind: RendezvousKind;
  icon: string;
  title: string;
  venue: string;
  city: string;
  when: string;
  why: string;
  matched_interest_ids: string[];
  prep: string[];
  confidence: "grounded" | "inferred";
  provenance: Provenance[];
}

export interface Rendezvous {
  client_id: string;
  client_name: string;
  interests: RendezvousInterest[];
  suggestions: RendezvousSuggestion[];
  talking_points: { text: string; provenance?: Provenance | null }[];
  avoid: string[];
}

// --- Decision Flow (layered "why this call" DAG over the insights data) ---

export type DecisionLayerId =
  | "notes"
  | "dna"
  | "signal"
  | "holding"
  | "candidate"
  | "action";

export interface DecisionNode {
  id: string;
  layer: DecisionLayerId;
  title: string;
  subtitle: string;
  detail: string;
  polarity?: Polarity | null;
  provenance: Provenance[];
}

export interface DecisionEdge {
  id: string;
  source: string;
  target: string;
  kind: "supports" | "flags" | "triggers" | "replaces" | "honors" | "proposes";
  label: string;
}

export interface Decision {
  client_id: string;
  client_name: string;
  headline: string;
  polarity: Polarity;
  layers: { id: DecisionLayerId; label: string }[];
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  recommendation: {
    action: string;
    sell: string | null;
    buy: string | null;
    rationale: string;
    constraints_checked: string[];
  };
}

// --- Investment Map globe (holdings + news + signal arcs) ---

export interface GlobeHolding {
  id: string;
  issuer: string;
  isin: string;
  industry_group: string | null;
  current_chf: number;
  lat: number;
  lng: number;
  country: string;
  city: string;
  verdict: "VIOLATION" | "WATCH" | "OK";
  weight: number;
}

export interface GlobeEvent {
  id: string;
  headline: string;
  source: string;
  published_at: string;
  lat: number;
  lng: number;
  country: string;
  severity: "high" | "med" | "low";
  summary: string;
  linked_holding_ids: string[];
  kind?: "alert" | "ambient";
  sentiment?: number;
}

export interface GlobeArc {
  id: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  color: string;
  label: string;
}

export interface Globe {
  client_id: string;
  holdings: GlobeHolding[];
  events: GlobeEvent[];
  news: GlobeEvent[];
  arcs: GlobeArc[];
  stats: {
    holdings: number;
    violations: number;
    watches: number;
    events: number;
    news: number;
  };
}
