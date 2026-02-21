import { Router } from 'express';
import authenticate from '../../auth/middlewares/authenticate';
import requireRole from '../../auth/middlewares/requireRole';
import { paymentController } from '../controllers';
import validateBody from '../../middlewares/validateZod';
import { 
  createPaymentSchema, 
  updatePaymentStatusSchema 
} from '../validators/payment.schema';

const router = Router();

// Rutas públicas o de cliente
// POST /payments - Crear nuevo pago (cliente o admin)
router.post('/', authenticate, validateBody(createPaymentSchema), (req, res) => 
  paymentController.create(req, res)
);

// GET /payments - Listar pagos (con filtros)
router.get('/', authenticate, requireRole('admin', 'client'), (req, res) => 
  paymentController.list(req, res)
);

// GET /payments/stats - Estadísticas de pagos (solo admin)
router.get('/stats', authenticate, requireRole('admin'), (req, res) => 
  paymentController.getStats(req, res)
);

// GET /payments/subscription/:subscriptionId - Pagos por suscripción
router.get('/subscription/:subscriptionId', authenticate, requireRole('admin', 'client'), (req, res) => 
  paymentController.getBySubscriptionId(req, res)
);

// GET /payments/:id - Obtener detalle de pago
router.get('/:id', authenticate, requireRole('admin', 'client'), (req, res) => 
  paymentController.getById(req, res)
);

// Rutas de administración
// PATCH /payments/:id/verify - Aprobar pago (solo admin)
router.patch('/:id/verify', authenticate, requireRole('admin'), (req, res) => 
  paymentController.verify(req, res)
);

// PATCH /payments/:id/reject - Rechazar pago (solo admin)
router.patch('/:id/reject', authenticate, requireRole('admin'), (req, res) => 
  paymentController.reject(req, res)
);

// PATCH /payments/:id/retry - Reintentar pago rechazado
router.patch('/:id/retry', authenticate, (req, res) => 
  paymentController.retry(req, res)
);

export default router;
