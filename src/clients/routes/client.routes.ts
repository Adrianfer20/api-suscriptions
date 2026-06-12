import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import clientController from '../controllers/client.controller';
import validateBody from '../../middlewares/validateZod';
import { createClientSchema, updateClientSchema } from '../validators/client.schema';

const router = Router();

// Backwards-compatible shims for former admin-style endpoints:
// These return 401 when Authorization header is missing (keeps existing tests/behaviour)
router.post('/', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/clients for admin operations' });
});
router.get('/:id', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/clients for admin operations' });
});
router.patch('/:id', (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ ok: false, message: 'Authorization header missing' });
	return res.status(404).json({ ok: false, message: 'Use /admin/clients for admin operations' });
});

// Self-service endpoints for authenticated clients (profile management)
router.get('/', authenticate, requireRole('client'), (req, res) => clientController.getMyProfile(req, res));
router.patch('/', authenticate, requireRole('client'), validateBody(updateClientSchema), (req, res) => clientController.updateMyProfile(req, res));
router.delete('/', authenticate, requireRole('client'), (req, res) => clientController.deleteMyAccount(req, res));

// Note: admin management of clients is provided under /admin/clients

export default router;
