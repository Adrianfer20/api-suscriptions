import { Request, Response } from 'express';
import { paymentService } from '../services';
import type { CreatePaymentInput, UpdatePaymentStatusInput, PaymentFiltersInput } from '../validators/payment.schema';

class PaymentController {
  /**
   * Crea un nuevo pago
   * POST /payments
   */
  async create(req: Request, res: Response) {
    try {
      const data = req.validatedData as CreatePaymentInput;
      const userId = req.user?.uid || req.body.createdBy;
      
      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Usuario no autenticado' });
      }

      const payment = await paymentService.create(data, userId);
      return res.status(201).json({ ok: true, data: payment });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'No se pudo crear el pago' });
    }
  }

  /**
   * Lista pagos con filtros
   * GET /payments
   */
  async list(req: Request, res: Response) {
    try {
      // Extraer filtros de query params o validatedData
      const filters: PaymentFiltersInput = (req.validatedData as PaymentFiltersInput) || {
        subscriptionId: req.query.subscriptionId as string | undefined,
        status: req.query.status as any,
        method: req.query.method as any,
        createdBy: req.query.createdBy as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      };
      
      const result = await paymentService.list(filters);
      return res.json({ 
        ok: true, 
        data: result.payments,
        pagination: {
          total: result.total,
          page: filters.page || 1,
          limit: filters.limit || 20,
          hasMore: result.hasMore,
        }
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'No se pudieron listar los pagos' });
    }
  }

  /**
   * Obtiene un pago por ID
   * GET /payments/:id
   */
  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const payment = await paymentService.getById(id);
      
      if (!payment) {
        return res.status(404).json({ ok: false, message: 'Pago no encontrado' });
      }
      
      return res.json({ ok: true, data: payment });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'No se pudo obtener el pago' });
    }
  }

  /**
   * Aprueba un pago (solo admin)
   * PATCH /payments/:id/verify
   */
  async verify(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const userId = req.user?.uid;
      const notes = (req.validatedData as UpdatePaymentStatusInput)?.notes;

      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Usuario no autenticado' });
      }

      // Verificar rol de admin
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Solo administradores pueden aprobar pagos' });
      }

      const payment = await paymentService.verify(id, userId, notes);
      return res.json({ ok: true, data: payment, message: 'Pago aprobado exitosamente' });
    } catch (err: any) {
      const status = err?.message.includes('no encontrado') ? 404 : 400;
      return res.status(status).json({ ok: false, message: err?.message || 'No se pudo aprobar el pago' });
    }
  }

  /**
   * Rechaza un pago (solo admin)
   * PATCH /payments/:id/reject
   */
  async reject(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const userId = req.user?.uid;
      const notes = (req.validatedData as UpdatePaymentStatusInput)?.notes;

      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Usuario no autenticado' });
      }

      // Verificar rol de admin
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Solo administradores pueden rechazar pagos' });
      }

      const payment = await paymentService.reject(id, userId, notes);
      return res.json({ ok: true, data: payment, message: 'Pago rechazado' });
    } catch (err: any) {
      const status = err?.message.includes('no encontrado') ? 404 : 400;
      return res.status(status).json({ ok: false, message: err?.message || 'No se pudo rechazar el pago' });
    }
  }

  /**
   * Reintenta un pago rechazado
   * PATCH /payments/:id/retry
   */
  async retry(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Usuario no autenticado' });
      }

      const payment = await paymentService.retry(id, userId);
      return res.json({ ok: true, data: payment, message: 'Pago reintentado' });
    } catch (err: any) {
      const status = err?.message.includes('no encontrado') ? 404 : 400;
      return res.status(status).json({ ok: false, message: err?.message || 'No se pudo reintentar el pago' });
    }
  }

  /**
   * Obtiene pagos por ID de suscripción
   * GET /payments/subscription/:subscriptionId
   */
  async getBySubscriptionId(req: Request, res: Response) {
    try {
      const subscriptionId = String(req.params.subscriptionId);
      const payments = await paymentService.getBySubscriptionId(subscriptionId);
      return res.json({ ok: true, data: payments });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'No se pudieron obtener los pagos' });
    }
  }

  /**
   * Obtiene estadísticas de pagos
   * GET /payments/stats
   */
  async getStats(req: Request, res: Response) {
    try {
      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      
      const stats = await paymentService.getStats(startDate, endDate);
      return res.json({ ok: true, data: stats });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: 'No se pudieron obtener las estadísticas' });
    }
  }
}

const paymentController = new PaymentController();
export default paymentController;
