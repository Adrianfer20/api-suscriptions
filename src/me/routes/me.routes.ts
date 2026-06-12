import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import authController from '../../auth/controllers/auth.controller';

const router = Router();

// GET /me - authenticated self-service profile endpoint
router.get('/', authenticate, authController.me);

export default router;
