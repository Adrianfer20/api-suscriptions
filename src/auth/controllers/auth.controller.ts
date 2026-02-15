import { Request, Response, NextFunction } from 'express';
import { Role } from '../auth.types';
import authService from '../services/auth.service';

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, displayName, role } = req.body as { email: string; password: string; displayName?: string; role?: Role };
    const result = await authService.createUserWithRole(email, password, displayName, role);
    return res.status(201).json({ ok: true, uid: result.uid, role: result.role });
  } catch (err) {
    console.error('[auth.controller.createUser] error:', err);
    return next(err);
  }
};

export const me = async (req: Request, res: Response) => {
  const user = req.user || null;
  return res.status(200).json({ ok: true, user });
};

export const getUserByUid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid } = req.params as { uid: string };
    const user = await authService.getUserByUid(uid);
    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }
    const result = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.name || null
    };
    return res.status(200).json({ ok: true, user: result });
  } catch (err) {
    return next(err);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid } = req.params;
    const { email, password, displayName, role, disabled } = req.body;
    
    // Basic validation
    if (role && !['admin', 'staff', 'client', 'guest'].includes(role)) {
       return res.status(400).json({ ok: false, message: 'Invalid role' });
    }

    const updatedUser = await authService.updateUser(uid, { email, password, displayName, role, disabled });
    return res.json({ ok: true, data: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || 'Failed to update user' });
  }
};

export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageToken = req.query.pageToken as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    
    const result = await authService.listUsers(pageToken, limit);
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || 'Failed to list users' });
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid } = req.params;
    await authService.deleteUser(uid);
    return res.json({ ok: true, message: 'User deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || 'Failed to delete user' });
  }
};

export default { createUser, me, getUserByUid, updateUser, listUsers, deleteUser };
