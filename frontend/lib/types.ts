// Shared types mirroring the FastAPI backend contract (see CLAUDE.md §7).

export type SourceType =
  | "crm_log"
  | "news"
  | "cio_list"
  | "portfolio"
  | "mandate"
  | "market_digest"
  // additional free data sources (CLAUDE.md §6)
  | "sec_filing"
  | "esg"
  | "earnings"
  | "analyst"
  | "macro"
  | "fundamentals"
  | "insider";

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

export interface LinkPreview {
  url: string;
  image_url?: string | null;
  favicon_url?: string | null;
  title?: string | null;
  site_name?: string | null;
  preview_kind: "thumbnail" | "favicon" | "none";
}

export interface Sentiment {
  score: number;
  label: string;
  // Where the score/label came from + the threshold that turned it into a label (Trust).
  source?: string | null;
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
  market_digest?: boolean;
  // origin feed: "news" | "sec_filing" | "esg" | "earnings" | "analyst" | "macro"
  signal_type?: string;
  provenance: Provenance;
}

export interface InsiderTrade {
  insider: string;
  role?: string | null;
  transaction: "BUY" | "SELL";
  shares?: number | null;
  value_usd?: number | null;
  date: string;
  provenance: Provenance;
}

export interface Fundamentals {
  isin: string;
  issuer: string;
  as_of?: string | null;
  currency?: string | null;
  pe_ratio?: number | null;
  dividend_yield?: number | null;
  next_ex_dividend?: string | null;
  market_cap?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  insider_summary?: string | null;
  insider_trades: InsiderTrade[];
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
  // Live SIX enrichment (present only in USE_LIVE mode where the listing has data).
  live_price?: number | null;
  live_ccy?: string | null;
  live_ts?: string | null;
  live_change_pct?: number | null;
  price_source?: string | null;
  six_ticker?: string | null;
  // CIO deviation status (Portfolio Agent: "assets no longer on the CIO list").
  cio_rating?: string | null; // BUY / HOLD / SELL, or null if off-list
  cio_status?: string | null; // "BUY" | "HOLD" | "SELL" | "OFF_LIST" | "CASH"
  provenance?: Provenance | null; // pointer to the Sample Portfolio workbook row
}

// --- Worldview engine: the client as a living model, not a topic set ---

export interface ScoreComponent {
  label: string;
  detail: string;
  points: number;
  max_points: number;
  provenance?: Provenance | null;
}

export interface RelevanceScore {
  score: number; // 0–100
  components: ScoreComponent[];
  summary: string;
}

export interface LensFraming {
  headline: string;
  narrative: string;
  client_quote?: string | null;
  quote_date?: string | null;
  draft_source: "llm" | "template";
  provenance: Provenance[];
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
  // worldview enrichment (deterministic, computed at match time)
  relevance?: RelevanceScore | null; // conviction-weighted 0–100 + cited breakdown
  lens?: LensFraming | null; // the item reframed through this client's own words
  celebrate: boolean; // a genuine 'call to celebrate' good-news moment, not a warning
}

export interface ReactionPrediction {
  predicted_objection: string;
  emotional_register: string;
  suggested_rebuttal: string;
  confidence: "grounded" | "inferred";
  draft_source: "llm" | "template";
  provenance: Provenance[];
}

export interface LifeEventSignal {
  label: string;
  date: string;
  months_ago: number;
  topic?: string | null;
  facet?: string | null;
  implication: string;
  provenance: Provenance;
}

export interface SubstitutionMetrics {
  sell_issuer?: string | null;
  buy_issuer?: string | null;
  vol_sell?: number | null;
  vol_buy?: number | null;
  vol_delta?: number | null;
  beta_sell?: number | null;
  beta_buy?: number | null;
  pe_sell?: number | null;
  pe_buy?: number | null;
  sentiment_sell?: number | null;
  sentiment_buy?: number | null;
  sentiment_delta?: number | null;
  sector_match: boolean;
  sub_asset_class_match: boolean;
  drift_pp_after?: number | null;
  value_tags_sell: string[];
  value_tags_buy: string[];
  risk_source?: string | null;
  // Pointers behind the side-by-side comparison (sold/bought rows + risk source).
  provenance?: Provenance[];
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
  buy_live_price?: number | null;
  buy_live_ccy?: string | null;
  buy_live_ts?: string | null;
  substitution?: SubstitutionMetrics | null;
  provenance: Provenance[];
}

export interface GoodNewsBriefing {
  headline: string;
  why_authentic: string;
  action_summary: string;
  provenance: Provenance[];
}

export interface StrategyProposal {
  client_id: string;
  headline: string;
  polarity: Polarity;
  swaps: Swap[];
  constraints_checked: string[];
  good_news_briefing?: GoodNewsBriefing | null;
  provenance: Provenance[];
}

export interface QueryAlternative {
  buy_isin: string;
  buy_issuer: string;
  industry_group: string | null;
  rationale: string;
  substitution: SubstitutionMetrics;
  provenance: Provenance[];
}

export interface RMQueryResult {
  kind: "alternative" | "context" | "none";
  question: string;
  answer: string | null;
  alternative: QueryAlternative | null;
  llm_used?: boolean;
  provenance?: Provenance[];
}

export interface RMQueryBody {
  match_id?: string | null;
  question?: string;
  exclude_isin?: string | null;
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
  // How the draft was produced: "llm" (Phoeniqs, style-tuned) or "template" (deterministic,
  // style-aware fallback) — surfaced so the prose's provenance is honest.
  draft_source: "llm" | "template";
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
  additional_proposals?: StrategyProposal[];
  // worldview engine outputs (per opened client, lazily)
  reaction?: ReactionPrediction | null; // digital-twin reaction to the primary proposal
  life_events?: LifeEventSignal[]; // recent dated values-shift signals
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
  provenance?: Provenance | null; // pointer to the Portfolio Strategies workbook row
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
  // How this fact entered the DNA: curated ground truth, auto-derived from the log, or captured.
  origin?: "seed" | "log" | "capture";
}

export interface ProfileInterestEdge {
  client_id: string;
  topic: string;
  facet: string;
  polarity: Polarity;
  weight: number;
  provenance: Provenance;
  origin?: "seed" | "log" | "capture";
  log_support?: number; // # of meeting-log entries that corroborate this edge
}

export interface ClientDetail {
  profile: {
    client_id: string;
    name: string;
    mandate: string;
    headline: string;
    facets: Record<string, FacetEntry[]>;
    interest_edges?: ProfileInterestEdge[];
    log_entries_scanned?: number; // # of CRM entries the agent read to build this DNA
  };
  mandate?: string;
  log_count?: number;
}

// --- Portfolio audit (proactive standing deviations) ---------------------------------------

export interface AuditValueConflict {
  isin: string;
  issuer: string;
  industry_group?: string | null;
  current_chf: number;
  conflicting_tags: string[];
  topics: string[];
  severity: string;
  reason: string;
  provenance: Provenance[];
}

export interface AuditCioDeviation {
  isin: string;
  issuer: string;
  status: string;
  current_chf: number;
  severity: string;
  reason: string;
  provenance: Provenance[];
}

export interface AuditDriftBreach {
  sub_asset_class: string;
  drift_pp: number;
  target_pct: number;
  current_pct: number;
  severity: string;
  reason: string;
  provenance: Provenance[];
}

export interface PortfolioAudit {
  client_id: string;
  value_conflicts: AuditValueConflict[];
  cio_deviations: AuditCioDeviation[];
  drift_breaches: AuditDriftBreach[];
  total_deviations: number;
  clean: boolean;
}

// --- 24/7 news watch ----------------------------------------------------------------------

export interface BreakingAlert {
  client_id: string;
  client_name: string;
  polarity: Polarity;
  headline: string;
  news_id: string;
  news_title: string;
  affected_holding?: string | null;
  detected_at: string;
}

export interface BreakingFeed {
  alerts: BreakingAlert[];
  watch_enabled: boolean;
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
  stt?: { provider: string; enabled: boolean };
  tts?: { provider: string; enabled: boolean };
  ocr?: { provider: string; enabled: boolean; model?: string };
}

// --- NEW opportunities (HI3: unheld CIO-BUY names aligned to client DNA) ---

export interface Opportunity {
  isin: string;
  issuer: string;
  industry_group: string | null;
  sub_asset_class: string | null;
  region: string | null;
  rating: string;
  value_tags: string[];
  sentiment: number | null;
  hist_vol_30d: number | null;
  risk_source: string | null;
  alignment_topics: string[];
  alignment_reason: string;
  score: number;
  provenance: Provenance[];
}

// --- transaction ledger + cash flows (HI4) ---

export interface LedgerTxn {
  transaction_id: string;
  timestamp: string;
  isin: string;
  issuer: string;
  side: "BUY" | "SELL";
  quantity: number | null;
  price_local: number | null;
  currency: string | null;
  fx_chf: number | null;
  price_chf: number | null;
  amount_chf: number;
  rationale: string | null;
  price_source: string | null;
  provenance: Provenance | null;
}

export interface LedgerPosition {
  isin: string;
  issuer: string;
  units: number | null;
  cost_basis_chf: number;
  current_chf: number;
  unrealised_pnl_chf: number;
  unrealised_pnl_pct: number | null;
  first_buy: string | null;
  holding_period_days: number | null;
  provenance: Provenance | null;
}

export interface LedgerCashFlow {
  flow_id: string;
  timestamp: string;
  side: string;
  amount_chf: number;
  rationale: string | null;
  provenance: Provenance | null;
}

export interface TransactionsData {
  portfolio: string;
  summary: {
    cost_basis_chf: number;
    current_chf: number;
    unrealised_pnl_chf: number;
    unrealised_pnl_pct: number | null;
    income_yield_pct: number | null;
    annual_income_chf: number | null;
    net_flows_chf: number;
    txn_count: number;
    buy_count: number;
    sell_count: number;
  };
  transactions: LedgerTxn[];
  positions: LedgerPosition[];
  cashflows: LedgerCashFlow[];
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
  off_list_count?: number;
  sell_rated_count?: number;
}

export interface CioDeviation {
  isin: string;
  issuer: string;
  industry_group: string | null;
  sub_asset_class: string;
  current_chf: number;
  pct: number;
  status: "OFF_LIST" | "SELL" | string;
  cio_rating: string | null;
  provenance?: Provenance | null;
  cio_provenance?: Provenance | null;
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
  cio_deviations: CioDeviation[];
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
  provenance?: Provenance | null;
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
  provenance?: Provenance | null;
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
  weight: number; // RM-set importance (1.0 = normal)
}

export interface ProposedFacet {
  facet: string;
  text: string;
  selected: boolean;
  weight: number; // RM-set importance (1.0 = normal)
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
  // Risk cues from the staged draft, carried through so the timeline reflects the
  // new entry without a second model call.
  risk_signals?: { term: string; direction: "up" | "down" | "flat" }[];
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

// Conversational capture — the TTS voice asks one follow-up at a time.
export interface CaptureFollowupBody {
  note: string;
  asked: string[];
}

export interface CaptureFollowup {
  id: string;
  question: string;
  done: boolean;
  kind: string;
  source: "llm" | "guided";
}

export interface CapturePrompts {
  client_id: string;
  client_name: string;
  first_name: string;
  prompts: CapturePrompt[];
}

// --- Overview dashboard (RM morning landing, aggregate across all clients) ---

export type Severity = "high" | "med" | "low";
export type MoveDirection = "up" | "down" | "flat";
export type PortfolioEventKind = "earnings" | "filing" | "ipo";

export interface OverviewTask {
  id: string;
  client_id: string;
  client_name: string;
  mandate: string;
  severity: Severity;
  polarity: Polarity;
  title: string;
  reason: string;
  trigger_headline: string;
  trigger_source: string;
  suggested_action: string;
  affected_issuer?: string | null;
  provenance: Provenance[];
}

export interface OverviewMeeting {
  id: string;
  client_id: string;
  client_name: string;
  mandate: string;
  date: string;
  day_label: string;
  time: string;
  channel: string;
  agenda: string;
  venue?: string | null;
  last_met?: string | null;
  last_modality?: string | null;
  has_alert: boolean;
  prep: string[];
  provenance: Provenance[];
}

export interface MarketMove {
  id: string;
  headline: string;
  source: string;
  published_at: string;
  direction: MoveDirection;
  sentiment: number;
  summary: string;
  url?: string | null;
  provenance: Provenance;
}

export interface EventHolder {
  client_id: string;
  client_name: string;
}

export interface PortfolioEvent {
  id: string;
  kind: PortfolioEventKind;
  issuer: string;
  isin: string;
  date: string;
  day_label: string;
  title: string;
  detail: string;
  held_by: EventHolder[];
  exposure_chf: number;
  provenance: Provenance;
}

export interface NewsClientRef {
  client_id: string;
  client_name: string;
  polarity: Polarity;
}

export interface NewsWireItem {
  id: string;
  title: string;
  source: string;
  published_at: string;
  topics: string[];
  sentiment_score: number;
  sentiment_label: string;
  issuer_name?: string | null;
  url?: string | null;
  relevant_clients: NewsClientRef[];
  provenance: Provenance;
}

export interface OverviewKpis {
  clients: number;
  priority_tasks: number;
  meetings_upcoming: number;
  market_moves: number;
  portfolio_events: number;
  aum_chf: number;
}

export interface Overview {
  generated_at: string;
  today: string;
  use_live: boolean;
  rm_name: string;
  briefing: string;
  kpis: OverviewKpis;
  priority_tasks: OverviewTask[];
  meetings: OverviewMeeting[];
  market_moves: MarketMove[];
  portfolio_events: PortfolioEvent[];
  news: NewsWireItem[];
}

// --- Auth (Google sign-in) + Twilio morning briefing ---

export interface WorkspaceStatus {
  connected: boolean;
  gmail: boolean;
  calendar: boolean;
}

export interface MeUser {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  phone_e164?: string | null;
  briefing_hour: number;
  briefing_enabled: boolean;
  workspace?: WorkspaceStatus;
}

export interface GmailMessage {
  id: string;
  thread_id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  attendees: string[];
  html_link: string;
}

export interface DraftBody {
  to: string;
  subject?: string;
  body?: string;
}

export interface DraftResult {
  id: string;
  message_id?: string | null;
  url: string;
}

export interface EventBody {
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

export interface AddEventResult {
  id: string;
  html_link: string;
  summary: string;
}

export interface AuthConfig {
  google_enabled: boolean;
  twilio_enabled: boolean;
  workspace_enabled: boolean;
  gmail_scope: boolean;
  calendar_scope: boolean;
}

export interface BriefingPrefsBody {
  phone_e164?: string | null;
  briefing_hour?: number;
  briefing_enabled?: boolean;
}

export interface BriefingPrefsResult {
  ok: boolean;
  phone_e164?: string | null;
  briefing_hour: number;
  briefing_enabled: boolean;
}

export interface SendTestResult {
  ok: boolean;
  text: string;
  sent: boolean;
  status?: string;
  sid?: string;
  error?: string;
  skipped?: string;
}

/* --------------------------------------------------------------------------
 * The Front Door — inbound email + the agentic kanban board
 * ------------------------------------------------------------------------ */

export type TaskStatus = "backlog" | "started" | "review" | "done" | "dismissed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskKind =
  | "email_reply"
  | "investment_review"
  | "research"
  | "schedule"
  | "document"
  | "general";
export type TaskSource = "email" | "news" | "manual" | "system";

export interface EmailMessage {
  id: string;
  from_name: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  received_at: string;
  client_id?: string | null;
  provenance: Provenance;
}

export interface DraftEmail {
  to_name: string;
  to_email: string;
  subject: string;
  body: string;
}

export interface TaskArtifact {
  kind: "draft_email" | "strategy" | "research_note" | "analysis" | "note";
  summary: string;
  body: string;
  draft_email?: DraftEmail | null;
  strategy_proposal?: StrategyProposal | null;
  dialogue?: DialogueSuggestion | null;
  confidence: "high" | "medium" | "low";
  llm_used: boolean;
  provenance: Provenance[];
}

export interface Task {
  id: string;
  client_id?: string | null;
  title: string;
  detail: string;
  kind: TaskKind;
  source: TaskSource;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
  dedup_key?: string | null;
  origin?: Provenance | null;
  artifact?: TaskArtifact | null;
  activity: string[];
  complex: boolean;
  requires_signoff: boolean;
  signed_off_by?: string | null;
}

export interface TaskCreateBody {
  title: string;
  detail?: string;
  client_id?: string | null;
  kind?: TaskKind;
  priority?: TaskPriority;
  execute?: boolean;
}

export interface TaskUpdateBody {
  status?: TaskStatus;
  priority?: TaskPriority;
  title?: string;
  detail?: string;
}

export interface TaskSignoffBody {
  rm_name?: string;
  edited_body?: string | null;
}

export interface IngestResult {
  created: Task[];
  count: number;
}
