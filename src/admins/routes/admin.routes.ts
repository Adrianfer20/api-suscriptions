import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import adminController from '../controllers/admin.controller';
import validateBody from '../../middlewares/validateZod';
import { createAdminSchema, updateAdminSchema } from '../validators/admin.schema';

const router = Router();

router.post('/', authenticate, requireRole('admin'), validateBody(createAdminSchema), (req, res) => adminController.create(req, res));
router.get('/', authenticate, requireRole('admin'), (req, res) => adminController.list(req, res));
router.get('/:id', authenticate, requireRole('admin'), (req, res) => adminController.getById(req, res));
router.patch('/:id', authenticate, requireRole('admin'), validateBody(updateAdminSchema), (req, res) => adminController.update(req, res));
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => adminController.delete(req, res));

export default router;
