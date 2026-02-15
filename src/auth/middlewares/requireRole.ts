import { Request, Response, NextFunction } from 'express';
import { Role } from '../auth.types';

export default function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    if (!allowed.includes(user.role)) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    return next();
  };
}
