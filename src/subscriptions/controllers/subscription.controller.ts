import { Request, Response } from 'express';
import automationService from '../../automation/services/automation.service';
import { Subscription } from '../models/subscription.model';
import { Plan } from '../models/subscription.model';
import subscriptionService from '../services/subscription.service';
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from '../validators/subscription.schema';

class SubscriptionController {
  async create(req: Request, res: Response) {
    try {
      const data = req.validatedData as CreateSubscriptionInput;
      // If an authenticated client creates subscription, enforce ownership
      if (req.user && req.user.role === 'client') {
        data.clientId = req.user.uid;
      }
      const sub = await subscriptionService.create(data);
      return res.status(201).json({ ok: true, data: sub });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to create subscription' });
    }
  }

  async plans(req: Request, res: Response) {
    // Return the list of available plans for clients (frontend can fetch this)
    const plans: Plan[] = ['Itinerante Ilimitado', 'Itinerante 100GB', 'Residencial'];
    return res.json({ ok: true, data: plans });
  }

  async list(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startAfter = typeof req.query.startAfter === 'string' ? req.query.startAfter : undefined;
      // If client requests list, return only their subscriptions
      if (req.user && req.user.role === 'client') {
        const clientUid = req.user.uid;
        const subs = await subscriptionService.listByClient(clientUid, limit, startAfter);
        return res.json({ ok: true, data: subs });
      }
      const subs = await subscriptionService.list(limit, startAfter);
      return res.json({ ok: true, data: subs });
    } catch (err: any) {
      const status = err?.message === 'Invalid cursor' ? 400 : 500;
      return res.status(status).json({ ok: false, message: err?.message || 'Unable to list subscriptions' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const sub = await subscriptionService.getById(id);
      if (!sub) return res.status(404).json({ ok: false, message: 'Not found' });
      // If client requesting, ensure ownership
      if (req.user && req.user.role === 'client') {
        const clientUid = req.user.uid;
        // Accept either client doc id or uid stored in subscription.clientId
        if (sub.clientId !== clientUid) {
          // try resolving client's doc id
          const client = await require('../../clients/services/client.service').default.getById(clientUid);
          const clientDocId = client ? (client as any).id : null;
          if (!clientDocId || sub.clientId !== clientDocId) {
            return res.status(403).json({ ok: false, message: 'Forbidden' });
          }
        }
      }
      return res.json({ ok: true, data: sub });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'Unable to fetch subscription' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const patch = req.validatedData as UpdateSubscriptionInput;
      const updated = await subscriptionService.update(id, patch);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to update' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await subscriptionService.delete(id);
      return res.status(200).json({ ok: true, message: 'Subscription deleted' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'Unable to delete subscription' });
    }
  }

  async renew(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const updated = await subscriptionService.renew(id);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to renew' });
    }
  }

  async changeStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { status } = req.validatedData as { status: 'active' | 'about_to_expire' | 'suspended' | 'paused' | 'cancelled' };
      const updated = await subscriptionService.update(id, { status });
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to change status' });
    }
  }
}

const subscriptionController = new SubscriptionController();
export default subscriptionController;
