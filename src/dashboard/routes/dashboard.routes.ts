import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';

const router = Router();

router.get('/', dashboardController.getSummary.bind(dashboardController));
router.get('/billing-periods', dashboardController.getBillingPeriods.bind(dashboardController));

export default router;
