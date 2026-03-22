import firebaseAdmin from '../config/firebaseAdmin';
import notificationModel from './notification.model';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  icon?: string;
  badge?: string;
  tag?: string;
  clickAction?: string;
}

export interface SendNotificationOptions {
  clientId?: string;
  userId?: string;
  phone?: string;
  payload: NotificationPayload;
}

class NotificationService {
  /**
   * Enviar notificación push a un cliente específico
   */
  async sendToClient(clientId: string, payload: NotificationPayload): Promise<{ success: number; failed: number; errors: string[] }> {
    const tokens = await notificationModel.getTokensByClient(clientId);
    return this.sendToTokens(tokens.map(t => t.token), payload);
  }

  /**
   * Enviar notificación push a un usuario por su userId (Firebase Auth UID)
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<{ success: number; failed: number; errors: string[] }> {
    const tokens = await notificationModel.getTokensByUserId(userId);
    return this.sendToTokens(tokens.map(t => t.token), payload);
  }

  /**
   * Enviar notificación push a un número de teléfono
   * Busca el cliente asociado al teléfono y envía a sus tokens
   */
  async sendToPhone(phone: string, payload: NotificationPayload, clientsCollection: any): Promise<{ success: number; failed: number; errors: string[] }> {
    // Buscar cliente por teléfono
    const clientQuery = await clientsCollection.where('phone', '==', phone).limit(1).get();
    
    if (clientQuery.empty) {
      return { success: 0, failed: 0, errors: ['No client found for phone'] };
    }

    const clientDoc = clientQuery.docs[0];
    const clientId = clientDoc.id;
    const clientData = clientDoc.data();

    // Si el cliente tiene un uid (Firebase Auth), buscar por userId también
    if (clientData.uid) {
      const userTokens = await notificationModel.getTokensByUserId(clientData.uid);
      const clientTokens = await notificationModel.getTokensByClient(clientId);
      
      // Combinar tokens únicos
      const allTokens = [...new Set([...userTokens.map(t => t.token), ...clientTokens.map(t => t.token)])];
      return this.sendToTokens(allTokens, payload);
    }

    return this.sendToClient(clientId, payload);
  }

  /**
   * Enviar notificación a múltiples tokens
   */
  async sendToTokens(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    if (!firebaseAdmin) {
      console.warn('[NotificationService] Firebase Admin not initialized, skipping push notification');
      return { success: 0, failed: tokens.length, errors: ['Firebase Admin not initialized'] };
    }

    if (tokens.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    // Validar que FCM esté disponible
    if (!firebaseAdmin.messaging) {
      console.warn('[NotificationService] Firebase Messaging not available');
      return { success: 0, failed: tokens.length, errors: ['Firebase Messaging not available'] };
    }

    const messaging = firebaseAdmin.messaging();
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Firebase permite hasta 500 tokens por batch
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const tokenBatch = tokens.slice(i, i + BATCH_SIZE);
      
      try {
        // Enviar a todos los tokens en batch
        const response = await messaging.sendEachForMulticast({
          tokens: tokenBatch,
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.icon && { imageUrl: payload.icon })
          },
          data: payload.data || {},
          android: {
            priority: 'high' as const,
            notification: {
              channelId: 'whatsapp_messages',
              ...(payload.tag && { tag: payload.tag }),
              ...(payload.clickAction && { click_action: payload.clickAction })
            }
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1
              }
            },
            headers: {
              'apns-priority': '10'
            }
          },
          webpush: {
            headers: {
              'Urgency': 'high',
              'TTL': '3600'
            }
          }
        });

        results.success += response.successCount;
        results.failed += response.failureCount;

        // Registrar errores específicos
        response.responses.forEach((resp, index) => {
          if (!resp.success) {
            const error = resp.error?.message || 'Unknown error';
            results.errors.push(`Token ${tokenBatch[index]}: ${error}`);
            
            // Si el token es inválido (notRegistered, invalid), desactivarlo
            if (error.includes('notRegistered') || error.includes('invalid')) {
              notificationModel.deactivateToken(tokenBatch[index]).catch(console.error);
            }
          }
        });

      } catch (error: any) {
        console.error('[NotificationService] Batch send error:', error);
        results.failed += tokenBatch.length;
        results.errors.push(`Batch error: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Enviar notificación de nuevo mensaje de WhatsApp
   */
  async sendWhatsAppNotification(
    options: SendNotificationOptions,
    clientsCollection: any
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const { payload, clientId, userId, phone } = options;

    if (clientId) {
      return this.sendToClient(clientId, payload);
    }

    if (userId) {
      return this.sendToUser(userId, payload);
    }

    if (phone) {
      return this.sendToPhone(phone, payload, clientsCollection);
    }

    return { success: 0, failed: 0, errors: ['No target specified'] };
  }
}

export default new NotificationService();
