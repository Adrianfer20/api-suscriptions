import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import subscriptionController from '../controllers/subscription.controller';
import validateBody from '../../middlewares/validateZod';
import { createSubscriptionSchema, updateSubscriptionSchema } from '../validators/subscription.schema';

const router = Router();

// Only admin may manage subscriptions
router.post('/', authenticate, requireRole('admin'), validateBody(createSubscriptionSchema), (req, res) => subscriptionController.create(req, res));
router.get('/', authenticate, requireRole('admin', 'client'), (req, res) => subscriptionController.list(req, res));
router.get('/:id', authenticate, requireRole('admin', 'client'), (req, res) => subscriptionController.getById(req, res));
router.patch('/:id', authenticate, requireRole('admin'), validateBody(updateSubscriptionSchema), (req, res) => subscriptionController.update(req, res));
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => subscriptionController.delete(req, res));
router.post('/:id/renew', authenticate, requireRole('admin'), (req, res) => subscriptionController.renew(req, res));

export default router;
