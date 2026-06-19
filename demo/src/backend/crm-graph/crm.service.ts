import fs from "fs";
import path from "path";
import {
  ClientProfile,
  Constraint,
  CrmClient,
  CrmInteraction,
  Provenance,
} from "../../shared/types";
import { PhoeniqsService } from "../services/phoeniqs.service";

const DATA_DIR = path.join(__dirname, "data");

/**
 * A deterministic extraction rule. When any keyword appears in a client's
 * notes, a grounded Constraint is emitted with provenance. `signals` are the
 * concrete tokens (industry groups, asset classes, special markers) the
 * compliance engine screens holdings against.
 */
interface Rule {
  id: string;
  kind: Constraint["kind"];
  severity: Constraint["severity"];
  text: string;
  signals: string[];
  keywords: string[];
}

const RULES: Rule[] = [
  {
    id: "capital-preservation",
    kind: "RISK",
    severity: "HARD",
    text: "Capital preservation and steady cash flow are the primary objectives.",
    // Posture, not a holding screen — the exclude-speculative rule does the flagging.
    signals: [],
    keywords: ["capital preservation", "preserve", "preserving wealth", "sleep at night", "steward", "preservation"],
  },
  {
    id: "exclude-speculative",
    kind: "EXCLUSION",
    severity: "HARD",
    text: "Avoid high-beta / speculative assets (esp. US software, cloud, crypto).",
    signals: ["Information Technology", "speculative", "high-beta", "crypto"],
    keywords: ["high-beta", "speculative", "speculate", "cloud bubble", "silicon valley", "block any"],
  },
  {
    id: "prefer-defensive-bluechip",
    kind: "INCLUSION",
    severity: "SOFT",
    text: "Prefer blue-chip defensive equities (staples, industrials) and sovereign bonds.",
    signals: ["Consumer Staples", "Industrials", "Government Bonds", "Domestic Bonds"],
    keywords: ["blue-chip", "defensive names", "consumer staples", "industrials", "sovereign bond", "established global"],
  },
  {
    id: "dividend-income",
    kind: "PREFERENCE",
    severity: "SOFT",
    text: "Values predictable dividend income from core holdings.",
    signals: ["dividend"],
    keywords: ["dividend", "payout", "predictable payouts", "cash flow"],
  },
  {
    id: "esg-positive-screen",
    kind: "INCLUSION",
    severity: "HARD",
    text: "Positive ESG / sustainability screening; favour biodiversity and supply-chain leaders.",
    signals: ["ESG", "sustainability", "biodiversity"],
    keywords: ["sustainab", "biodiversity", "reforest", "positive-screening", "corporate sustainability", "protect natural", "ecosystem"],
  },
  {
    id: "esg-exclude-laggards",
    kind: "EXCLUSION",
    severity: "HARD",
    text: "Exclude environmental laggards / greenwashing; penalise firms that treat nature as a free resource.",
    signals: ["Energy", "Materials", "fossil", "mining"],
    keywords: ["penalize companies", "penalise", "greenwash", "free resource", "low-scoring esg"],
  },
  {
    id: "supply-chain-governance",
    kind: "EXCLUSION",
    severity: "HARD",
    text: "Screen consumer-discretionary holdings for supply-chain / labor governance liabilities.",
    signals: ["Consumer Discretionary"],
    keywords: ["supply-chain", "supply chain", "sweatshop", "labor", "labour", "wage theft", "governance liabilit", "exploitation", "clean labor"],
  },
  {
    id: "reputation-risk",
    kind: "RISK",
    severity: "HARD",
    text: "Accepts lower returns to avoid reputational contamination from portfolio holdings.",
    signals: [],
    keywords: ["reputation", "hypocrisy", "backlash", "public face", "brand equity", "lower sharpe", "clean portfolio"],
  },
  {
    id: "succession-focus",
    kind: "PREFERENCE",
    severity: "SOFT",
    text: "Long-term horizon: succession / wealth transmission to the next generation.",
    signals: [],
    keywords: ["succession", "grandchildren", "wealth transmission", "transmission"],
  },
  {
    id: "balanced-growth-mandate",
    kind: "RISK",
    severity: "SOFT",
    text: "Standard global balanced growth mandate.",
    signals: [],
    keywords: ["global balanced", "balanced growth", "standard global"],
  },
];

const LIQUIDITY_KEYWORDS = ["withdrawal", "capital call", "deposit", "top-up", "renovation", "acquisition", "land acquisition"];

interface LlmEnrichment {
  summary?: string;
  riskPosture?: string;
  constraints?: { text: string; kind?: Constraint["kind"]; signals?: string[]; quote?: string }[];
}

export class CrmService {
  private clients: CrmClient[];
  private phoeniqs: PhoeniqsService;
  // Profiles are deterministic per client; cache so LLM enrichment runs once.
  private profileCache = new Map<string, ClientProfile>();

  constructor(phoeniqs?: PhoeniqsService) {
    this.phoeniqs = phoeniqs ?? new PhoeniqsService();
    this.clients = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, "crm.json"), "utf-8")
    ) as CrmClient[];
  }

  listClients() {
    return this.clients.map(({ interactions, ...rest }) => rest);
  }

  getClient(id: string): CrmClient | undefined {
    return this.clients.find((c) => c.id === id || c.name.toLowerCase() === id.toLowerCase());
  }

  /** Keyword search across every note; returns matching interactions with a snippet. */
  search(query: string, limit = 20) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: (CrmInteraction & { client: string; clientId: string; snippet: string })[] = [];
    for (const client of this.clients) {
      for (const it of client.interactions) {
        if (it.note.toLowerCase().includes(q) || it.contact.toLowerCase().includes(q)) {
          hits.push({ ...it, client: client.name, clientId: client.id, snippet: snippet(it.note, q) });
        }
      }
    }
    return hits.slice(0, limit);
  }

  /**
   * Build the structured, grounded profile for a client. Rules run always
   * (offline-safe); when `enrich` is set and Phoeniqs is configured, the LLM
   * refines the summary/risk posture and may add constraints with citations.
   */
  async getProfile(id: string, enrich = true): Promise<ClientProfile | undefined> {
    const client = this.getClient(id);
    if (!client) return undefined;
    const cacheKey = `${client.id}:${enrich}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached) return cached;

    const constraints = this.extractConstraints(client);
    const fired = new Set(constraints.map((c) => c.id));

    const themes = [...new Set(constraints.map((c) => themeOf(c.id)).filter(Boolean) as string[])];
    const preferences = constraints
      .filter((c) => c.kind === "PREFERENCE" || c.kind === "INCLUSION")
      .map((c) => c.text);
    const liquidityEvents = this.extractLiquidityEvents(client);
    const riskPosture = deriveRiskPosture(fired);

    const profile: ClientProfile = {
      clientId: client.id,
      name: client.name,
      household: client.household,
      mandate: client.mandate,
      riskPosture,
      summary: deriveSummary(client, constraints),
      constraints,
      preferences,
      themes,
      liquidityEvents,
      keyPeople: client.contacts,
      llmEnriched: false,
    };

    if (enrich && this.phoeniqs.configured) {
      try {
        await this.enrichWithLlm(client, profile);
      } catch (err) {
        console.warn(`[CRM] LLM enrichment failed for ${client.id}:`, (err as Error).message);
      }
    }

    this.profileCache.set(cacheKey, profile);
    return profile;
  }

  private extractConstraints(client: CrmClient): Constraint[] {
    const out: Constraint[] = [];
    for (const rule of RULES) {
      const provenance: Provenance[] = [];
      for (const it of client.interactions) {
        const low = it.note.toLowerCase();
        const kw = rule.keywords.find((k) => low.includes(k));
        if (kw) {
          provenance.push({ interactionId: it.id, date: it.date, quote: snippet(it.note, kw) });
        }
      }
      if (provenance.length) {
        out.push({
          id: rule.id,
          kind: rule.kind,
          text: rule.text,
          signals: rule.signals,
          severity: rule.severity,
          source: "rule",
          provenance: provenance.slice(0, 3),
        });
      }
    }
    return out;
  }

  private extractLiquidityEvents(client: CrmClient) {
    const events: { date: string; text: string; provenance: Provenance }[] = [];
    for (const it of client.interactions) {
      const low = it.note.toLowerCase();
      const kw = LIQUIDITY_KEYWORDS.find((k) => low.includes(k));
      if (kw) {
        events.push({
          date: it.date,
          text: snippet(it.note, kw),
          provenance: { interactionId: it.id, date: it.date, quote: snippet(it.note, kw) },
        });
      }
    }
    return events;
  }

  private async enrichWithLlm(client: CrmClient, profile: ClientProfile): Promise<void> {
    const notes = client.interactions
      .map((it) => `[${it.id} · ${it.date} · ${it.medium}] ${it.note}`)
      .join("\n");
    const system =
      "You are a private-banking CRM analyst. Read the relationship-manager notes and " +
      "extract the client's investment constraints. Respond with ONLY one minified JSON object, no prose.";
    const user =
      `Client: ${client.name} household.\n\nNotes:\n${notes}\n\n` +
      `Return JSON: {"summary":"<=3 sentences","riskPosture":"<short phrase>",` +
      `"constraints":[{"text":"<rule>","kind":"EXCLUSION|INCLUSION|RISK|PREFERENCE",` +
      `"signals":["<industry or keyword>"],"quote":"<verbatim phrase from a note>"}]}. ` +
      `Only include constraints actually supported by the notes; quote must be copied verbatim.`;

    const result = await this.phoeniqs.extractJson<LlmEnrichment>(system, user, 900);
    if (!result) return;

    if (result.summary) profile.summary = result.summary.trim();
    if (result.riskPosture) profile.riskPosture = result.riskPosture.trim();

    const existing = new Set(profile.constraints.map((c) => c.text.toLowerCase().slice(0, 40)));
    for (const c of result.constraints ?? []) {
      if (!c?.text) continue;
      const key = c.text.toLowerCase().slice(0, 40);
      if (existing.has(key)) continue;
      existing.add(key);
      // Ground the LLM constraint: find the note its quote came from.
      const prov = this.locateQuote(client, c.quote);
      profile.constraints.push({
        id: `llm-${slug(c.text)}`,
        kind: (c.kind as Constraint["kind"]) || "PREFERENCE",
        text: c.text.trim(),
        signals: Array.isArray(c.signals) ? c.signals : [],
        severity: c.kind === "EXCLUSION" || c.kind === "RISK" ? "HARD" : "SOFT",
        source: "llm",
        provenance: prov ? [prov] : [],
      });
    }
    profile.llmEnriched = true;
  }

  private locateQuote(client: CrmClient, quote?: string): Provenance | null {
    if (!quote) return null;
    const q = quote.trim().toLowerCase().slice(0, 40);
    for (const it of client.interactions) {
      if (it.note.toLowerCase().includes(q)) {
        return { interactionId: it.id, date: it.date, quote: quote.trim() };
      }
    }
    return null;
  }
}

// ---- helpers ----

/** Return the sentence (trimmed to ~200 chars) containing the keyword. */
function snippet(note: string, keyword: string): string {
  const low = note.toLowerCase();
  const idx = low.indexOf(keyword.toLowerCase());
  if (idx === -1) return note.slice(0, 200);
  const start = note.lastIndexOf(".", idx) + 1;
  let end = note.indexOf(".", idx + keyword.length);
  if (end === -1) end = note.length;
  const sentence = note.slice(start, end + 1).trim();
  return sentence.length > 220 ? sentence.slice(0, 217) + "…" : sentence;
}

const THEME_MAP: Record<string, string> = {
  "capital-preservation": "Capital Preservation",
  "exclude-speculative": "Anti-Speculation",
  "prefer-defensive-bluechip": "Defensive Blue-Chip",
  "dividend-income": "Dividend Income",
  "esg-positive-screen": "ESG / Sustainability",
  "esg-exclude-laggards": "ESG / Sustainability",
  "supply-chain-governance": "Supply-Chain Governance",
  "reputation-risk": "Reputation Risk",
  "succession-focus": "Succession Planning",
  "balanced-growth-mandate": "Balanced Growth",
};
function themeOf(ruleId: string): string | undefined {
  return THEME_MAP[ruleId];
}

function deriveRiskPosture(fired: Set<string>): string {
  if (fired.has("capital-preservation") || fired.has("exclude-speculative"))
    return "Conservative — capital preservation, low tolerance for speculative risk";
  if (fired.has("esg-positive-screen"))
    return "Values-driven — accepts market risk within a strict ESG mandate";
  if (fired.has("reputation-risk"))
    return "Reputation-sensitive — trades return for a clean portfolio footprint";
  if (fired.has("balanced-growth-mandate"))
    return "Balanced growth — standard diversified mandate";
  return "Standard balanced";
}

function deriveSummary(client: CrmClient, constraints: Constraint[]): string {
  const hard = constraints.filter((c) => c.severity === "HARD").map((c) => c.text);
  const lead = client.mandate ? `${client.name} household on a ${client.mandate} mandate.` : `${client.name} household.`;
  return hard.length ? `${lead} Key constraints: ${hard.join(" ")}` : lead;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}
