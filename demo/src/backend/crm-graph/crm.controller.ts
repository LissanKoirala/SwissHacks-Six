import { Request, Response } from "express";
import { CrmService } from "./crm.service";
import { ComplianceService } from "./compliance.service";

type Strategy = "Defensive" | "Balanced" | "Growth";
const STRATEGIES: Strategy[] = ["Defensive", "Balanced", "Growth"];

/**
 * Agent-facing CRM endpoints. Everything is grounded: profiles and compliance
 * findings carry `provenance` (source note id, date, verbatim quote) so a
 * downstream agent can cite exactly which client instruction it acted on.
 */
export class CrmController {
  private crm: CrmService;
  private compliance: ComplianceService;

  constructor() {
    this.crm = new CrmService();
    this.compliance = new ComplianceService(this.crm);
  }

  listClients(_req: Request, res: Response): void {
    res.json({ success: true, data: this.crm.listClients() });
  }

  getClient(req: Request, res: Response): void {
    const client = this.crm.getClient(req.params.id);
    if (!client) {
      res.status(404).json({ success: false, error: `Unknown client: ${req.params.id}` });
      return;
    }
    res.json({ success: true, data: client });
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    const enrich = req.query.enrich !== "false";
    try {
      const profile = await this.crm.getProfile(req.params.id, enrich);
      if (!profile) {
        res.status(404).json({ success: false, error: `Unknown client: ${req.params.id}` });
        return;
      }
      res.json({ success: true, data: profile });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  search(req: Request, res: Response): void {
    const q = String(req.query.q || "");
    if (!q.trim()) {
      res.status(400).json({ success: false, error: "missing query param ?q=" });
      return;
    }
    res.json({ success: true, data: this.crm.search(q) });
  }

  async checkCompliance(req: Request, res: Response): Promise<void> {
    const portfolioParam = req.query.portfolio ? String(req.query.portfolio) : undefined;
    const portfolio = portfolioParam
      ? STRATEGIES.find((s) => s.toLowerCase() === portfolioParam.toLowerCase())
      : undefined;
    if (portfolioParam && !portfolio) {
      res.status(400).json({ success: false, error: `portfolio must be one of ${STRATEGIES.join(", ")}` });
      return;
    }
    try {
      const report = await this.compliance.check(req.params.id, portfolio);
      if (!report) {
        res.status(404).json({ success: false, error: `Unknown client: ${req.params.id}` });
        return;
      }
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}
