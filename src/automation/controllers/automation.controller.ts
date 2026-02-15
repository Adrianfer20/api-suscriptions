import { Request, Response } from 'express';
import automationService from '../services/automation.service';

class AutomationController {
  async runDaily(req: Request, res: Response) {
    try {
      const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual-trigger';
      const invokedBy = req.user?.uid || req.user?.email || 'manual';
      const result = await automationService.runDaily({ dryRun, invokedBy, reason });
      return res.json({ ok: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'Automation run failed' });
    }
  }
}

const automationController = new AutomationController();
export default automationController;
