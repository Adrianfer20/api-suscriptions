import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../../config/firebaseAdmin';
import { AuthUser } from '../auth.types';

export default async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Authorization header missing' });
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ ok: false, message: 'Token missing' });
  }
  if (!firebaseAdmin) {
    return res.status(500).json({ ok: false, message: 'Auth infrastructure not available' });
  }
  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(token);
    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email || undefined,
      name: typeof (decoded as any).name === 'string' ? (decoded as any).name : undefined,
      role: typeof (decoded as any).role === 'string' ? ((decoded as any).role as any) : undefined
    };
    req.user = user;
    return next();
  } catch (err) {
    return res.status(403).json({ ok: false, message: 'Invalid token' });
  }
}
