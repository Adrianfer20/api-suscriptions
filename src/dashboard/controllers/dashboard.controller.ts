import { Request, Response } from 'express';
import dashboardService from '../services/dashboard.service';

class DashboardController {
  async getSummary(req: Request, res: Response) {
    try {
      const summary = await dashboardService.getSummary();
      res.json(summary);
    } catch (err) {
      console.error('Dashboard summary error:', err);
      res.status(500).json({ error: 'Failed to load dashboard summary' });
    }
  }

  async getBillingPeriods(req: Request, res: Response) {
    try {
      const billingPeriods = await dashboardService.getBillingPeriodsGrouped();
      res.json(billingPeriods);
    } catch (err) {
      console.error('Dashboard billing periods error:', err);
      res.status(500).json({ error: 'Failed to load dashboard billing periods' });
    }
  }
}

const dashboardController = new DashboardController();
export default dashboardController;
