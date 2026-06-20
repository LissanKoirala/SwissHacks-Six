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

export type TravelMode = "local" | "train" | "flight";
export type ParticipantRole = "rm" | "client" | "family";

export interface RendezvousParticipant {
  id: string;
  name: string;
  role: ParticipantRole;
  city: string;
  country: string;
  iata: string;
  lat: number;
  lng: number;
}

export interface FlightLeg {
  participant_id: string;
  participant_name: string;
  role: ParticipantRole;
  from_city: string;
  from_iata: string;
  to_city: string;
  to_iata: string;
  distance_km: number;
  travel_hours: number;
  co2_kg: number;
  mode: TravelMode;
  timezone_shift_h: number;
}

export interface FlightQuote {
  participant_id: string;
  participant_name: string;
  role: ParticipantRole;
  from_iata: string;
  to_iata: string;
  mode: TravelMode;
  cabin: "economy" | "premium_economy" | "business" | "first";
  price_chf: number;
  price_usd: number;
  co2_kg: number;
  travel_hours: number;
  note?: string;
  search_url?: string | null;
  price_source?: "estimate" | "google_flights";
}

export interface CityActivity {
  id: string;
  kind: RendezvousKind;
  icon: string;
  title: string;
  venue: string;
  when: string;
  why: string;
  matched_interest_ids: string[];
  prep: string[];
  score?: number;
  image_url?: string | null;
  url?: string | null;
}

export interface CityWeather {
  kind: string;
  temp_min_c?: number | null;
  temp_max_c?: number | null;
  temp_typical_c?: number | null;
  precipitation_mm?: number | null;
  label: string;
  event_date?: string | null;
}

export interface CityBriefing {
  city: string;
  country: string;
  summary: string;
  image_url?: string | null;
  weather: CityWeather;
  sources: string[];
}

export interface CandidateFlightQuotes {
  iata: string;
  flight_quotes: FlightQuote[];
  total_travel_cost_chf: number;
}

export interface CandidateCity {
  city: string;
  country: string;
  iata: string;
  lat: number;
  lng: number;
  total_co2_kg: number;
  max_travel_hours: number;
  avg_travel_hours: number;
  fairness_score: number;
  composite_score: number;
  is_optimal: boolean;
  legs: FlightLeg[];
  activities?: CityActivity[];
  flight_quotes?: FlightQuote[];
  total_travel_cost_chf?: number;
  city_briefing?: CityBriefing;
  globe?: RendezvousGlobeData;
}

export interface RendezvousCalendarSlot {
  label: string;
  start: string;
  end: string;
  rationale: string;
}

export interface RendezvousGlobePoint {
  id: string;
  kind: "origin" | "meeting";
  label: string;
  lat: number;
  lng: number;
  color: string;
  role?: ParticipantRole | null;
}

export interface RendezvousGlobeArc {
  id: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  label: string;
  color: string;
  travel_hours: number;
  mode: TravelMode;
}

export interface RendezvousGlobeData {
  points: RendezvousGlobePoint[];
  arcs: RendezvousGlobeArc[];
  focus_lat: number;
  focus_lng: number;
}

export interface MeetingOptimization {
  mode: "fairness" | "environmental";
  default_mode: "fairness" | "environmental";
  summary: string;
  participants: RendezvousParticipant[];
  candidates: CandidateCity[];
  optimal_city?: string | null;
  optimal_country?: string | null;
  optimal_iata?: string | null;
  calendar_slot?: RendezvousCalendarSlot | null;
  calendar_options?: RendezvousCalendarSlot[];
  globe: RendezvousGlobeData;
  live_flight_quotes_deferred?: boolean;
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
  meeting?: MeetingOptimization;
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

// --- Risk Timeline (per-client risk-appetite scrubber over the CRM log) ---

export interface RiskBand {
  id: string;
  label: string;
  lo: number;
  hi: number;
}

export interface RiskSignal {
  term: string;
  direction: "up" | "down" | "flat";
  weight: number;
}

export interface RiskPoint {
  id: string;
  date: string;
  modality: string;
  contact: string;
  note_excerpt: string;
  risk_score: number;
  delta: number;
  direction: "up" | "down" | "flat";
  risk_relevant: boolean;
  signals: RiskSignal[];
  mandate_gap: number;
  mandate_fit: "aligned" | "cautious-drift" | "risk-on-drift";
  edges_known: number;
  facets_known: number;
  facet_changes: { facet: string; text: string }[];
  provenance: Provenance;
}

export interface RiskTimeline {
  client_id: string;
  client_name: string;
  mandate: string;
  baseline: number;
  band: { lo: number; hi: number; label: string };
  bands: RiskBand[];
  start_date: string;
  end_date: string;
  points: RiskPoint[];
  milestones: { point_id: string; label: string; kind: string }[];
  current: RiskPoint;
}

// --- RM Capture (multimodal note → staged preview → RM confirm) ---

export interface ProposedEdge {
  topic: string;
  topic_label: string;
  facet: string;
  polarity: Polarity;
  rationale: string;
  selected: boolean;
}

export interface ProposedFacet {
  facet: string;
  text: string;
  selected: boolean;
}

export interface RiskPreview {
  delta: number;
  direction: "up" | "down" | "flat";
  signals: { term: string; direction: "up" | "down" | "flat" }[];
}

export interface CaptureDraft {
  client_id: string;
  note: string;
  date: string;
  modality: string;
  modality_icon: string;
  contact: string;
  rm_name: string;
  detected_topics: { topic: string; label: string }[];
  proposed_edges: ProposedEdge[];
  proposed_facets: ProposedFacet[];
  risk_preview: RiskPreview;
  preview_entry_id: string;
}

export interface CaptureExtractBody {
  note: string;
  modality: string;
  contact?: string;
  rm_name?: string;
  date?: string;
}

export interface CaptureConfirm {
  note: string;
  modality: string;
  contact?: string;
  rm_name?: string;
  date?: string;
  edges: ProposedEdge[];
  facets: ProposedFacet[];
}

export interface CaptureResult {
  ok: boolean;
  entry_id: string;
  applied: { edges: number; facets: number };
  log_count: number;
}

// Guided capture — client-aware "pseudo-interview" prompts that scaffold a
// richer voice/text log.
export interface CapturePrompt {
  id: string;
  kind: string;
  question: string;
  hint: string;
}

export interface CapturePrompts {
  client_id: string;
  client_name: string;
  first_name: string;
  prompts: CapturePrompt[];
}
