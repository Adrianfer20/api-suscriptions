import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import subscriptionController from '../../subscriptions/controllers/subscription.controller';
import validateBody from '../../middlewares/validateZod';
import { createSubscriptionSchema, updateSubscriptionSchema, statusSchema } from '../../subscriptions/validators/subscription.schema';

const router = Router();

// Admin-only subscription management (migrated from top-level /subscriptions)
router.post('/', authenticate, requireRole('admin'), validateBody(createSubscriptionSchema), (req, res) => subscriptionController.create(req, res));
router.get('/', authenticate, requireRole('admin'), (req, res) => subscriptionController.list(req, res));
router.get('/:id', authenticate, requireRole('admin'), (req, res) => subscriptionController.getById(req, res));
router.patch('/:id', authenticate, requireRole('admin'), validateBody(updateSubscriptionSchema), (req, res) => subscriptionController.update(req, res));
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => subscriptionController.delete(req, res));
router.post('/:id/renew', authenticate, requireRole('admin'), (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'The renew endpoint is deprecated. Use /billing-periods/:id/pay to register payment and manage subscription lifecycle through billing periods.'
  });
});
router.patch('/:id/status', authenticate, requireRole('admin'), validateBody(statusSchema), (req, res) => subscriptionController.changeStatus(req, res));

export default router;
