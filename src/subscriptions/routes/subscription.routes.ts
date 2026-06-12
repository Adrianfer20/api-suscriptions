import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import subscriptionController from '../controllers/subscription.controller';

const router = Router();

// Public endpoint: list available subscription plans for frontend
router.get('/plans', (req, res) => subscriptionController.plans(req, res));

// The top-level subscriptions endpoint is read-only for clients.
// Subscription creation is managed by administrators under /admin/subscriptions.
router.post('/', (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'Client creation of subscriptions is deprecated. Use /admin/subscriptions for admin-managed subscription creation.'
  });
});
router.get('/', authenticate, requireRole('client', 'admin'), (req, res) => subscriptionController.list(req, res));
router.get('/:id', authenticate, requireRole('client', 'admin'), (req, res) => subscriptionController.getById(req, res));

// Admin operations moved to /admin/subscriptions. Keep compatibility shims
router.patch('/:id', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/subscriptions for admin operations' });
});
router.delete('/:id', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/subscriptions for admin operations' });
});
router.post('/:id/renew', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/subscriptions for admin operations' });
});
router.patch('/:id/status', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/subscriptions for admin operations' });
});

export default router;
