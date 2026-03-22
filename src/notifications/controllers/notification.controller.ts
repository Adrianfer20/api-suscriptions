import { Request, Response } from 'express';
import notificationModel from '../notification.model';

class NotificationController {
  /**
   * Registrar un token FCM para el cliente actual
   * POST /notifications/token
   */
  async registerToken(req: Request, res: Response) {
    try {
      const { token, deviceInfo } = req.body as {
        token: string;
        deviceInfo?: string;
      };

      if (!token) {
        return res.status(400).json({ ok: false, message: 'Token es requerido' });
      }

      // El clientId puede venir del body o del usuario autenticado
      const clientId = req.body.clientId || (req.user as any)?.clientId;
      const userId = req.body.userId || (req.user as any)?.uid;

      if (!clientId) {
        return res.status(400).json({ ok: false, message: 'clientId es requerido' });
      }

      const result = await notificationModel.saveToken(clientId, token, userId, deviceInfo);
      
      return res.json({ 
        ok: true, 
        message: 'Token registrado correctamente',
        data: { id: result.id }
      });
    } catch (err: any) {
      console.error('Error registering FCM token:', err);
      return res.status(500).json({ ok: false, message: err?.message || 'Error al registrar token' });
    }
  }

  /**
   * Eliminar/desactivar un token FCM
   * DELETE /notifications/token
   */
  async removeToken(req: Request, res: Response) {
    try {
      const { token } = req.body as { token: string };

      if (!token) {
        return res.status(400).json({ ok: false, message: 'Token es requerido' });
      }

      await notificationModel.deactivateToken(token);
      
      return res.json({ ok: true, message: 'Token eliminado correctamente' });
    } catch (err: any) {
      console.error('Error removing FCM token:', err);
      return res.status(500).json({ ok: false, message: err?.message || 'Error al eliminar token' });
    }
  }

  /**
   * Obtener los tokens FCM del cliente actual
   * GET /notifications/tokens
   */
  async getTokens(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string || (req.user as any)?.clientId;

      if (!clientId) {
        return res.status(400).json({ ok: false, message: 'clientId es requerido' });
      }

      const tokens = await notificationModel.getTokensByClient(clientId);
      
      // No devolver los tokens reales por seguridad, solo información
      return res.json({ 
        ok: true, 
        data: tokens.map(t => ({
          id: t.id,
          deviceInfo: t.deviceInfo,
          createdAt: t.createdAt,
          active: t.active
        }))
      });
    } catch (err: any) {
      console.error('Error getting FCM tokens:', err);
      return res.status(500).json({ ok: false, message: err?.message || 'Error al obtener tokens' });
    }
  }

  /**
   * Eliminar todos los tokens del cliente (útil para logout)
   * DELETE /notifications/tokens/all
   */
  async removeAllTokens(req: Request, res: Response) {
    try {
      const clientId = req.body.clientId || (req.user as any)?.clientId;

      if (!clientId) {
        return res.status(400).json({ ok: false, message: 'clientId es requerido' });
      }

      await notificationModel.deactivateTokensByClient(clientId);
      
      return res.json({ ok: true, message: 'Todos los tokens eliminados correctamente' });
    } catch (err: any) {
      console.error('Error removing all FCM tokens:', err);
      return res.status(500).json({ ok: false, message: err?.message || 'Error al eliminar tokens' });
    }
  }
}

const notificationController = new NotificationController();
export default notificationController;
