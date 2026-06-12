import { Request, Response } from 'express';
import billingPeriodService from '../services/billingPeriod.service';
import subscriptionService from '../../subscriptions/services/subscription.service';
import clientService from '../../clients/services/client.service';
import { CreateBillingPeriodInput, UpdateBillingPeriodInput, PayBillingPeriodInput, ListBillingPeriodsInput } from '../validators/billingPeriod.schema';

class BillingPeriodController {
  async create(req: Request, res: Response) {
    try {
      const data = req.validatedData as CreateBillingPeriodInput;
      const period = await billingPeriodService.create(data);
      return res.status(201).json({ ok: true, data: period });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to create billing period' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const filters: ListBillingPeriodsInput = {
        subscriptionId: typeof req.query.subscriptionId === 'string' ? req.query.subscriptionId : undefined,
        status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20
      };
      const result = await billingPeriodService.list(filters);
      return res.json({ ok: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to list billing periods' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const period = await billingPeriodService.getById(id);
      if (!period) return res.status(404).json({ ok: false, message: 'Billing period not found' });
      return res.json({ ok: true, data: period });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'Unable to fetch billing period' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const patch = req.validatedData as UpdateBillingPeriodInput;
      const updated = await billingPeriodService.update(id, patch);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to update billing period' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await billingPeriodService.delete(id);
      return res.json({ ok: true, message: 'Billing period deleted' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'Unable to delete billing period' });
    }
  }

  async pay(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const data = req.validatedData as PayBillingPeriodInput;
      const userId = req.user?.uid;
      const userRole = req.user?.role;
      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Usuario no autenticado' });
      }

      const period = await billingPeriodService.getById(id);
      if (!period) {
        return res.status(404).json({ ok: false, message: 'Billing period not found' });
      }

      if (userRole === 'client') {
        const subscription = await subscriptionService.getById(period.subscriptionId);
        if (!subscription) {
          return res.status(404).json({ ok: false, message: 'Subscription not found' });
        }

        const client = await clientService.getById(userId);
        if (!client) {
          return res.status(403).json({ ok: false, message: 'Client not found' });
        }

        if (subscription.clientId !== userId && subscription.clientId !== client.id) {
          return res.status(403).json({ ok: false, message: 'Forbidden' });
        }
      }

      const result = await billingPeriodService.payBillingPeriod(id, data, userId);
      return res.status(200).json({ ok: true, data: result });
    } catch (err: any) {
      const message = err?.message || 'Unable to process billing period payment';
      if (message.includes('not found') || message.includes('already paid')) {
        return res.status(400).json({ ok: false, message });
      }
      return res.status(400).json({ ok: false, message });
    }
  }
}

const billingPeriodController = new BillingPeriodController();
export default billingPeriodController;
