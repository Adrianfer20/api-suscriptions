import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';
import authController from '../controllers/auth.controller';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';

const router = Router();

// POST /auth/create (admin only)
router.post('/create',
  authenticate,
  requireRole('admin'),
  [
    body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('displayName').optional().isString().isLength({ min: 2 }).trim(),
    body('role').optional().isIn(['admin','staff','client','guest']).withMessage('Invalid role')
  ],
  validateRequest,
  authController.createUser
);

// GET /auth/me
router.get('/me', authenticate, authController.me);

// GET /auth/user/:uid (requires authentication)
router.get('/user/:uid', authenticate, authController.getUserByUid);

export default router;
