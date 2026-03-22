import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import notificationController from '../controllers/notification.controller';
import authenticate from '../../auth/middlewares/authenticate';
import validateRequest from '../../auth/middlewares/validateRequest';

const router = Router();

// POST /notifications/token - Registrar token FCM
// Puede ser usado tanto por clientes autenticados como no autenticados (con clientId)
router.post(
  '/token',
  [
    body('token').isString().notEmpty().withMessage('Token es requerido'),
    body('clientId').optional().isString(),
    body('deviceInfo').optional().isString()
  ],
  validateRequest,
  (req: Request, res: Response) => notificationController.registerToken(req, res)
);

// DELETE /notifications/token - Eliminar token FCM
router.delete(
  '/token',
  authenticate,
  [
    body('token').isString().notEmpty().withMessage('Token es requerido')
  ],
  validateRequest,
  (req: Request, res: Response) => notificationController.removeToken(req, res)
);

// GET /notifications/tokens - Obtener tokens del cliente
router.get(
  '/tokens',
  authenticate,
  [
    query('clientId').optional().isString()
  ],
  validateRequest,
  (req: Request, res: Response) => notificationController.getTokens(req, res)
);

// DELETE /notifications/tokens/all - Eliminar todos los tokens (logout)
router.delete(
  '/tokens/all',
  authenticate,
  [
    body('clientId').optional().isString()
  ],
  validateRequest,
  (req: Request, res: Response) => notificationController.removeAllTokens(req, res)
);

export default router;
