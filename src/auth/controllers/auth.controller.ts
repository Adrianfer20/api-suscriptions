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

export default { createUser, me, getUserByUid };
