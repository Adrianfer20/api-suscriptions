import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import billingPeriodController from '../controllers/billingPeriod.controller';
import validateBody from '../../middlewares/validateZod';
import { createBillingPeriodSchema, updateBillingPeriodSchema, payBillingPeriodSchema, listBillingPeriodsSchema } from '../validators/billingPeriod.schema';

const router = Router();

// Billing period management endpoints (no manual creation from frontend)
router.get('/', authenticate, requireRole('admin', 'client'), (req, res) => billingPeriodController.list(req, res));
router.get('/:id', authenticate, requireRole('admin', 'client'), (req, res) => billingPeriodController.getById(req, res));
router.patch('/:id', authenticate, requireRole('admin'), validateBody(updateBillingPeriodSchema), (req, res) => billingPeriodController.update(req, res));
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => billingPeriodController.delete(req, res));
router.post('/:id/pay', authenticate, requireRole('admin', 'client'), validateBody(payBillingPeriodSchema), (req, res) => billingPeriodController.pay(req, res));

export default router;
