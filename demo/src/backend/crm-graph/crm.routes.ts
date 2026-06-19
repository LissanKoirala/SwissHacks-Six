import { Router, Request, Response } from "express";
import { CrmController } from "./crm.controller";

const router = Router();
const controller = new CrmController();

// Agent surface for pulling grounded CRM data.
router.get("/clients", (req: Request, res: Response) => controller.listClients(req, res));
router.get("/search", (req: Request, res: Response) => controller.search(req, res));
router.get("/clients/:id", (req: Request, res: Response) => controller.getClient(req, res));
router.get("/clients/:id/profile", (req: Request, res: Response) => controller.getProfile(req, res));
router.get("/clients/:id/compliance", (req: Request, res: Response) => controller.checkCompliance(req, res));

export default router;
