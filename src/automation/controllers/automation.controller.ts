import { Request, Response } from 'express';
import automationService from '../services/automation.service';
import { restartDailyAutomationJob, isJobScheduled } from '../jobs/daily.job';

class AutomationController {
  async getSchedulerConfig(req: Request, res: Response) {
    try {
      const config = await automationService.getSchedulerConfig();
      const isRunning = isJobScheduled();
      return res.json({ ok: true, data: { ...config, isRunning } });
    } catch (err: any) {
       return res.status(500).json({ ok: false, message: err?.message || 'Failed to get scheduler config' });
    }
  }

  async updateSchedulerConfig(req: Request, res: Response) {
      try {
          const { cronExpression, enabled, timeZone } = req.body;
          
          // Filter undefined values because Firestore throws error on undefined
          const configUpdate: any = {};
          if (cronExpression !== undefined) configUpdate.cronExpression = cronExpression;
          if (enabled !== undefined) configUpdate.enabled = enabled;
          if (timeZone !== undefined) configUpdate.timeZone = timeZone;

          if (Object.keys(configUpdate).length === 0) {
              return res.status(400).json({ ok: false, message: 'No valid configuration fields provided' });
          }

          await automationService.updateSchedulerConfig(configUpdate);

          // Restart job
          await restartDailyAutomationJob();
          
          return res.json({ ok: true, message: 'Scheduler configuration updated' });
      } catch (err: any) {
          console.error('[AutomationController] Update error:', err);
          return res.status(500).json({ ok: false, message: err?.message || 'Failed to update scheduler config' });
      }
  }

  async deleteSchedulerConfig(req: Request, res: Response) {
      try {
          await automationService.deleteSchedulerConfig();
          // Restart job (will revert to defaults)
          await restartDailyAutomationJob();
          return res.json({ ok: true, message: 'Scheduler configuration deleted (reset to defaults)' });
      } catch (err: any) {
          return res.status(500).json({ ok: false, message: err?.message || 'Failed to delete scheduler config' });
      }
  }

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
