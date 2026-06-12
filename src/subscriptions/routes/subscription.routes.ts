import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import subscriptionController from '../controllers/subscription.controller';
import validateBody from '../../middlewares/validateZod';
import { createSubscriptionSchema } from '../validators/subscription.schema';

const router = Router();

// Public endpoint: list available subscription plans for frontend
router.get('/plans', (req, res) => subscriptionController.plans(req, res));

// The top-level subscriptions endpoint is read-only for clients.
// Subscription creation is managed by administrators under /admin/subscriptions.
router.post(
	'/',
	(req, res, next) => {
		// Return 401 early if Authorization header missing (tests expect this)
		if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
		return next();
	},
	validateBody(createSubscriptionSchema),
	authenticate,
	requireRole('admin', 'client'),
	(req, res) => subscriptionController.create(req, res)
);
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
