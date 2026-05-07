import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import communicationsController from '../controllers/communications.controller';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import validateRequest from '../../auth/middlewares/validateRequest';
import { allowedTemplates } from '../templates';

const router = Router();

// POST /communications/webhook (Public for Twilio - incoming messages)
router.post('/webhook', (req: Request, res: Response) => communicationsController.webhook(req, res));

// POST /communications/webhook-status (Public for Twilio - status callbacks)
router.post('/webhook-status', (req: Request, res: Response) => communicationsController.webhookStatus(req, res));

// GET /communications/conversations (Admin/Staff)
router.get(
  '/conversations',
  authenticate,
  requireRole('admin'),
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
  requireRole('admin'),
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
  requireRole('admin'),
  [param('clientId').isString().notEmpty()],
  validateRequest,
  (req: Request, res: Response) => communicationsController.getMessages(req, res)
);

// POST /communications/conversations/:clientId/read (Admin/Staff)
router.post(
  '/conversations/:clientId/read',
  authenticate,
  requireRole('admin'),
  [param('clientId').isString().notEmpty()],
  validateRequest,
  (req: Request, res: Response) => communicationsController.markAsRead(req, res)
);

// POST /communications/subscriptions/link (Admin) - Link subscriptions to a phone/conversation
router.post(
  '/subscriptions/link',
  authenticate,
  requireRole('admin'),
  [
    body('phone').isString().notEmpty(),
    body('subscriptionIds').isArray({ min: 1 })
  ],
  validateRequest,
  (req: Request, res: Response) => communicationsController.linkSubscriptions(req, res)
);

// GET /communications/subscriptions/:phone (Admin/Staff) - Get subscriptions linked to a phone
router.get(
  '/subscriptions/:phone',
  authenticate,
  requireRole('admin'),
  [param('phone').isString().notEmpty()],
  validateRequest,
  (req: Request, res: Response) => communicationsController.getSubscriptions(req, res)
);

// DELETE /communications/conversations/:phone (Admin) - Delete conversation and messages
router.delete(
  '/conversations/:phone',
  authenticate,
  requireRole('admin'),
  [param('phone').isString().notEmpty()],
  validateRequest,
  (req: Request, res: Response) => communicationsController.deleteConversation(req, res)
);

export default router;
