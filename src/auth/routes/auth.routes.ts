import { Router } from 'express';
import { body } from 'express-validator';
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
    body('email').isEmail().withMessage('Invalid email').normalizeEmail({ gmail_remove_dots: false }),
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

// PATCH /auth/user/:uid (admin only) - Update user (role, email, pass, name)
router.patch('/user/:uid', authenticate, requireRole('admin'), authController.updateUser);

// DELETE /auth/user/:uid (admin only) - Delete user
router.delete('/user/:uid', authenticate, requireRole('admin'), authController.deleteUser);

// GET /auth/users (admin only) - List users
router.get('/users', authenticate, requireRole('admin'), authController.listUsers);

export default router;
