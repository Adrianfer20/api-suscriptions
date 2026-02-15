import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import automationController from '../controllers/automation.controller';

const router = Router();

router.post('/run-daily', authenticate, requireRole('admin'), (req, res) => automationController.runDaily(req, res));

export default router;
