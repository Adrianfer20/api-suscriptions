import firebaseAdmin from '../config/firebaseAdmin';

export interface FCMToken {
  id?: string;
  token: string;
  clientId: string;
  userId?: string;
  deviceInfo?: string;
  createdAt: any;
  updatedAt: any;
  active: boolean;
}

class NotificationModel {
  private tokensCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('fcm_tokens');
  }

  /**
   * Guardar un token FCM para un cliente
   */
  async saveToken(clientId: string, token: string, userId?: string, deviceInfo?: string): Promise<FCMToken> {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    // Verificar si ya existe un token igual
    const existingQuery = await this.tokensCollection()
      .where('token', '==', token)
      .where('clientId', '==', clientId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      // Actualizar token existente
      const existingDoc = existingQuery.docs[0];
      await existingDoc.ref.update({
        updatedAt: now,
        active: true,
        ...(deviceInfo && { deviceInfo })
      });
      return { id: existingDoc.id, token, clientId, active: true, createdAt: now, updatedAt: now };
    }

    // Crear nuevo token
    const docRef = await this.tokensCollection().add({
      token,
      clientId,
      userId,
      deviceInfo,
      createdAt: now,
      updatedAt: now,
      active: true
    });

    return {
      id: docRef.id,
      token,
      clientId,
      userId,
      deviceInfo,
      createdAt: now,
      updatedAt: now,
      active: true
    };
  }

  /**
   * Obtener todos los tokens activos de un cliente
   */
  async getTokensByClient(clientId: string): Promise<FCMToken[]> {
    const snapshot = await this.tokensCollection()
      .where('clientId', '==', clientId)
      .where('active', '==', true)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FCMToken));
  }

  /**
   * Obtener todos los tokens activos para un userId (UID de Firebase Auth)
   */
  async getTokensByUserId(userId: string): Promise<FCMToken[]> {
    const snapshot = await this.tokensCollection()
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FCMToken));
  }

  /**
   * Desactivar un token (cuando el usuario cierra sesión o elimina el token)
   */
  async deactivateToken(token: string): Promise<void> {
    const snapshot = await this.tokensCollection()
      .where('token', '==', token)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const now = firebaseAdmin!.firestore.FieldValue.serverTimestamp();
      await snapshot.docs[0].ref.update({
        active: false,
        updatedAt: now
      });
    }
  }

  /**
   * Desactivar todos los tokens de un cliente
   */
  async deactivateTokensByClient(clientId: string): Promise<void> {
    const snapshot = await this.tokensCollection()
      .where('clientId', '==', clientId)
      .where('active', '==', true)
      .get();

    if (!snapshot.empty) {
      const now = firebaseAdmin!.firestore.FieldValue.serverTimestamp();
      const batch = firebaseAdmin!.firestore().batch();
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { active: false, updatedAt: now });
      });
      await batch.commit();
    }
  }
}

export default new NotificationModel();
