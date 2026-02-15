import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import clientController from '../controllers/client.controller';
import validateBody from '../../middlewares/validateZod';
import { createClientSchema, updateClientSchema } from '../validators/client.schema';

const router = Router();

// All endpoints require authentication + admin role
router.post('/', authenticate, requireRole('admin'), validateBody(createClientSchema), (req, res) => clientController.create(req, res));
router.get('/', authenticate, requireRole('admin'), (req, res) => clientController.list(req, res));
router.get('/:id', authenticate, requireRole('admin'), (req, res) => clientController.getById(req, res));
router.patch('/:id', authenticate, requireRole('admin'), validateBody(updateClientSchema), (req, res) => clientController.update(req, res));

export default router;
