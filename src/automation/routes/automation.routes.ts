import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import automationController from '../controllers/automation.controller';

const router = Router();

router.get('/config', authenticate, requireRole('admin'), (req, res) => automationController.getSchedulerConfig(req, res));
router.put('/config', authenticate, requireRole('admin'), (req, res) => automationController.updateSchedulerConfig(req, res));
router.delete('/config', authenticate, requireRole('admin'), (req, res) => automationController.deleteSchedulerConfig(req, res));
router.post('/run-daily', authenticate, requireRole('admin'), (req, res) => automationController.runDaily(req, res));


export default router;
