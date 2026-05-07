import { Request, Response } from 'express';
import adminService from '../services/admin.service';
import type { CreateAdminInput, UpdateAdminInput } from '../validators/admin.schema';

class AdminController {
  async create(req: Request, res: Response) {
    try {
      const data = req.validatedData as CreateAdminInput;
      const admin = await adminService.create(data);
      return res.status(201).json({ ok: true, data: admin });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to create admin' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startAfter = typeof req.query.startAfter === 'string' ? req.query.startAfter : undefined;
      const admins = await adminService.list(limit, startAfter);
      return res.json({ ok: true, data: admins });
    } catch (err: any) {
      const status = err?.message === 'Invalid cursor' ? 400 : 500;
      return res.status(status).json({ ok: false, message: err?.message || 'Unable to list admins' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const admin = await adminService.getById(id);
      if (!admin) return res.status(404).json({ ok: false, message: 'Not found' });
      return res.json({ ok: true, data: admin });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'Unable to fetch admin' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const patch = req.validatedData as UpdateAdminInput;
      const updated = await adminService.update(id, patch);
      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Unable to update' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const uid = String(req.params.id);
      const adminIds = await adminService.deleteByUid(uid);
      if (!adminIds || adminIds.length === 0) {
        return res.status(404).json({ ok: false, message: 'Admin not found' });
      }
      return res.json({ ok: true, deleted: adminIds });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'No se pudo eliminar el admin' });
    }
  }
}

const adminController = new AdminController();
export default adminController;
