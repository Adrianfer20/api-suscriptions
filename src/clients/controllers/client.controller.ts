import { Request, Response } from 'express';
import clientService from '../services/client.service';
import firebaseAdmin from '../../config/firebaseAdmin';
import type { CreateClientInput, UpdateClientInput } from '../validators/client.schema';

class ClientController {
    async delete(req: Request, res: Response) {
      try {
        const uid = String(req.params.id);
        // Eliminar cliente en Firestore y conversaciones
        const clientIds = await clientService.deleteByUid(uid);
        if (!clientIds || clientIds.length === 0) {
          return res.status(404).json({ ok: false, message: 'Cliente no encontrado' });
        }
        // Eliminar usuario en Auth
        if (clientIds && clientIds.length > 0 && firebaseAdmin && firebaseAdmin.auth) {
          try {
            await firebaseAdmin.auth().deleteUser(uid);
          } catch (err) {
            // Si ya no existe en Auth, ignorar
          }
        }
        return res.json({ ok: true, deleted: clientIds });
      } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message || 'No se pudo eliminar el cliente' });
      }
    }
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

  async getMyProfile(req: Request, res: Response) {
    try {
      const uid = (req.user as any)?.uid;
      if (!uid) return res.status(401).json({ ok: false, message: 'Unauthorized' });
      const client = await clientService.getById(uid);
      if (!client) return res.status(404).json({ ok: false, message: 'Client not found' });
      return res.json({ ok: true, data: client });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'Unable to fetch profile' });
    }
  }

  async updateMyProfile(req: Request, res: Response) {
    try {
      const uid = (req.user as any)?.uid;
      if (!uid) return res.status(401).json({ ok: false, message: 'Unauthorized' });
      const patch = req.validatedData as UpdateClientInput;
      const client = await clientService.getById(uid);
      if (!client) return res.status(404).json({ ok: false, message: 'Client not found' });
      const updated = await clientService.update((client as any).id as string, patch);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to update profile' });
    }
  }

  async deleteMyAccount(req: Request, res: Response) {
    try {
      const uid = (req.user as any)?.uid;
      if (!uid) return res.status(401).json({ ok: false, message: 'Unauthorized' });
      const clientIds = await clientService.deleteByUid(uid);
      if (!clientIds || clientIds.length === 0) return res.status(404).json({ ok: false, message: 'Client not found' });
      if (firebaseAdmin && firebaseAdmin.auth) {
        try {
          await firebaseAdmin.auth().deleteUser(uid);
        } catch (err) {
          // ignore
        }
      }
      return res.json({ ok: true, deleted: clientIds });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'Unable to delete account' });
    }
  }
}

const clientController = new ClientController();
export default clientController;
