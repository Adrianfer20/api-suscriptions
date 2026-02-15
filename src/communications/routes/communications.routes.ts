import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import communicationsController from '../controllers/communications.controller';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import validateRequest from '../../auth/middlewares/validateRequest';
import { allowedTemplates } from '../templates';

const router = Router();

// POST /communications/webhook (Public for Twilio)
router.post('/webhook', (req: Request, res: Response) => communicationsController.webhook(req, res));

// GET /communications/conversations (Admin/Staff)
router.get(
  '/conversations',
  authenticate,
  requireRole('admin', 'staff'),
  validateRequest,
  (req: Request, res: Response) => communicationsController.getConversations(req, res)
);

// POST /communications/send-template (admin only)
router.post(
  '/send-template',
  authenticate,
  requireRole('admin'),
  [
    body('clientId').isString().notEmpty(),
    body('template').isString().notEmpty().isIn(allowedTemplates).withMessage('Invalid template')
  ],
  validateRequest,
  (req: Request, res: Response) => communicationsController.sendTemplate(req, res)
);

// POST /communications/send (admin/staff text reply)
router.post(
  '/send',
  authenticate,
  requireRole('admin', 'staff'),
  [
      body('clientId').isString().notEmpty(),
      body('body').isString().notEmpty()
  ],
  validateRequest,
  (req: Request, res: Response) => communicationsController.sendText(req, res)
);

// GET /communications/messages/:clientId
router.get(
  '/messages/:clientId',
  authenticate,
  requireRole('admin', 'staff'),
  [param('clientId').isString().notEmpty()],
  validateRequest,
  (req: Request, res: Response) => communicationsController.getMessages(req, res)
);

export default router;
