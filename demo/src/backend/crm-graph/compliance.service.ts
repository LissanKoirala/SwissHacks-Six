import fs from "fs";
import path from "path";
import {
  ClientProfile,
  ComplianceFinding,
  ComplianceReport,
  Constraint,
} from "../../shared/types";
import { CrmService } from "./crm.service";

const DATA_DIR = path.join(__dirname, "data");

interface Holding {
  assetClass: string;
  subAssetClass: string;
  region: string;
  industry: string;
  issuer: string;
  security: string;
  isin: string;
  targetCHF: number | null;
  currentCHF: number | null;
  ticker: string;
}

type Strategy = "Defensive" | "Balanced" | "Growth";

export class ComplianceService {
  private portfolios: Record<Strategy, Holding[]>;
  private crm: CrmService;

  constructor(crm: CrmService) {
    this.crm = crm;
    this.portfolios = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, "portfolios.json"), "utf-8")
    ) as Record<Strategy, Holding[]>;
  }

  /**
   * Cross-check a client's CRM-derived constraints against a portfolio's
   * holdings. Defaults to the client's inferred mandate; pass `portfolio` to
   * stress-test against another strategy (e.g. "what if Räber went Growth").
   */
  async check(clientId: string, portfolio?: Strategy): Promise<ComplianceReport | undefined> {
    const profile = await this.crm.getProfile(clientId);
    if (!profile) return undefined;

    const strategy: Strategy = portfolio || (profile.mandate as Strategy) || "Balanced";
    const holdings = this.portfolios[strategy] || [];

    // Only HARD exclusions/risk constraints with concrete signals can flag a holding.
    const screening = profile.constraints.filter(
      (c) => (c.kind === "EXCLUSION" || c.kind === "RISK") && c.signals.length > 0
    );

    const findings: ComplianceFinding[] = [];
    for (const h of holdings) {
      const finding = evaluate(h, screening);
      if (finding.verdict !== "OK") findings.push(finding);
    }

    findings.sort((a, b) => rank(b.verdict) - rank(a.verdict) || (b.currentCHF || 0) - (a.currentCHF || 0));

    const violations = findings.filter((f) => f.verdict === "VIOLATION").length;
    const watches = findings.filter((f) => f.verdict === "WATCH").length;
    const exposureAtRiskCHF = findings
      .filter((f) => f.verdict === "VIOLATION")
      .reduce((sum, f) => sum + (f.currentCHF || 0), 0);

    return {
      clientId: profile.clientId,
      name: profile.name,
      portfolio: strategy,
      checkedHoldings: holdings.length,
      violations,
      watches,
      exposureAtRiskCHF: Math.round(exposureAtRiskCHF),
      findings,
      llmAdjudicated: profile.llmEnriched,
    };
  }
}

const CRYPTO_HINT = /etp|ethereum|bitcoin|crypto|21shares/i;

/** Evaluate one holding against the screening constraints. */
function evaluate(h: Holding, screening: Constraint[]): ComplianceFinding {
  const base = {
    issuer: h.issuer,
    isin: h.isin,
    industry: h.industry,
    assetClass: h.assetClass,
    currentCHF: h.currentCHF,
  };

  for (const c of screening) {
    const sig = c.signals.map((s) => s.toLowerCase());
    const isCrypto = sig.includes("crypto") && CRYPTO_HINT.test(`${h.issuer} ${h.security}`);
    const industryHit = sig.includes(h.industry.toLowerCase());
    const speculativeHit =
      (sig.includes("speculative") || sig.includes("high-beta")) &&
      h.assetClass === "Equities" &&
      (h.industry === "Information Technology" || CRYPTO_HINT.test(`${h.issuer} ${h.security}`));

    if (isCrypto || speculativeHit) {
      return {
        ...base,
        verdict: "VIOLATION",
        constraintId: c.id,
        reason: `${h.issuer} (${h.industry || h.assetClass}) conflicts with hard constraint: ${c.text}`,
        provenance: c.provenance,
      };
    }
    if (industryHit) {
      // Industry-level match against a HARD exclusion: flag for review.
      const verdict = c.severity === "HARD" ? "VIOLATION" : "WATCH";
      return {
        ...base,
        verdict,
        constraintId: c.id,
        reason: `${h.issuer} is in "${h.industry}", screened by: ${c.text}`,
        provenance: c.provenance,
      };
    }
  }

  return { ...base, verdict: "OK", constraintId: null, reason: "", provenance: [] };
}

function rank(v: ComplianceFinding["verdict"]): number {
  return v === "VIOLATION" ? 2 : v === "WATCH" ? 1 : 0;
}
