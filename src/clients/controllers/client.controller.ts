import { Request, Response } from 'express';
import clientService from '../services/client.service';
import type { CreateClientInput, UpdateClientInput } from '../validators/client.schema';

class ClientController {
  async create(req: Request, res: Response) {
    try {
      const data = req.validatedData as CreateClientInput;
      const client = await clientService.create(data);
      return res.status(201).json({ ok: true, data: client });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to create client' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startAfter = typeof req.query.startAfter === 'string' ? req.query.startAfter : undefined;
      const clients = await clientService.list(limit, startAfter);
      return res.json({ ok: true, data: clients });
    } catch (err: any) {
      const status = err?.message === 'Invalid cursor' ? 400 : 500;
      return res.status(status).json({ ok: false, message: err?.message || 'Unable to list clients' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const client = await clientService.getById(id);
      if (!client) return res.status(404).json({ ok: false, message: 'Not found' });
      return res.json({ ok: true, data: client });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'Unable to fetch client' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const patch = req.validatedData as UpdateClientInput;
      const updated = await clientService.update(id, patch);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to update' });
    }
  }
}

const clientController = new ClientController();
export default clientController;
