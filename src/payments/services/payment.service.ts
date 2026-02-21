import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { PaymentModel } from '../models/payment.model';
import { CreatePaymentInput, PaymentFiltersInput } from '../validators/payment.schema';
import { PaymentStatus, PAYMENT_METHOD_REQUIREMENTS } from '../types';

class PaymentService {
  private collection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('payments');
  }

  private subscriptionsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('subscriptions');
  }

  /**
   * Filtra campos undefined/null para evitar errores de Firestore
   */
  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Crea un nuevo pago en estado pending
   */
  async create(data: CreatePaymentInput, userId: string): Promise<PaymentModel> {
    // Verificar que la suscripción existe
    const subscriptionDoc = await this.subscriptionsCollection().doc(data.subscriptionId).get();
    if (!subscriptionDoc.exists) {
      throw new Error('Suscripción no encontrada');
    }

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    // Normalizar email a lowercase
    const payerEmail = data.payerEmail?.toLowerCase().trim();

    // Validar campos obligatorios según el método
    const requirements = PAYMENT_METHOD_REQUIREMENTS[data.method as keyof typeof PAYMENT_METHOD_REQUIREMENTS];
    const missingFields: string[] = [];
    
    for (const field of requirements.requiredFields) {
      const value = data[field as keyof CreatePaymentInput];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
    }

    const rawPaymentData = {
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      currency: data.currency || 'USD',
      date: data.date,
      method: data.method,
      status: 'pending' as const,
      reference: data.reference,
      payerEmail,
      payerPhone: data.payerPhone,
      payerIdNumber: data.payerIdNumber,
      bank: data.bank,
      receiptUrl: data.receiptUrl,
      free: data.free,
      createdAt: now,
      createdBy: userId,
    };

    // Filtrar campos undefined/null para Firestore
    const paymentData = this.sanitizeData(rawPaymentData) as Omit<PaymentModel, 'id'>;

    const docRef = await this.collection().add(paymentData);
    const snap = await docRef.get();
    
    return { id: docRef.id, ...(snap.data() as Omit<PaymentModel, 'id'>) } as PaymentModel;
  }

  /**
   * Lista pagos con filtros y paginación
   */
  async list(filters: PaymentFiltersInput): Promise<{ payments: PaymentModel[]; total: number; hasMore: boolean }> {
    let query: any = this.collection().orderBy('createdAt', 'desc');

    // Aplicar filtros
    if (filters.subscriptionId) {
      query = query.where('subscriptionId', '==', filters.subscriptionId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.method) {
      query = query.where('method', '==', filters.method);
    }
    if (filters.createdBy) {
      query = query.where('createdBy', '==', filters.createdBy);
    }

    // Paginación
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    // Obtener total (sin paginación)
    const countQuery = query;
    const countSnap = await countQuery.get();
    const total = countSnap.docs.length;

    // Aplicar offset y limit
    query = query.offset(offset).limit(limit + 1); // +1 para determinar si hay más

    const snaps = await query.get();
    const hasMore = snaps.docs.length > limit;
    
    // Si hay más, quitamos el último
    const docs = hasMore ? snaps.docs.slice(0, -1) : snaps.docs;

    return {
      payments: docs.map((d: firestore.QueryDocumentSnapshot) => ({
        id: d.id,
        ...(d.data() as Omit<PaymentModel, 'id'>)
      })) as PaymentModel[],
      total,
      hasMore,
    };
  }

  /**
   * Obtiene un pago por ID
   */
  async getById(id: string): Promise<PaymentModel | null> {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<PaymentModel, 'id'>) } as PaymentModel;
  }

  /**
   * Actualiza el estado de un pago
   */
  async updateStatus(
    id: string, 
    status: PaymentStatus, 
    userId: string, 
    notes?: string
  ): Promise<PaymentModel> {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) {
      throw new Error('Pago no encontrado');
    }

    const currentData = doc.data() as PaymentModel;
    
    // Validar transiciones de estado
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      pending: ['verified', 'rejected'],
      verified: [],
      rejected: ['pending'],
    };

    if (!validTransitions[currentData.status].includes(status)) {
      throw new Error(`Transición de estado inválida: ${currentData.status} → ${status}`);
    }

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    const updateDataRaw: Record<string, unknown> = {
      status,
      notes: notes || currentData.notes,
    };

    // Si se verifica, agregar metadata de verificación
    if (status === 'verified') {
      updateDataRaw.verifiedAt = now;
      updateDataRaw.verifiedBy = userId;
    }

    // Filtrar campos undefined para Firestore
    const updateData = this.sanitizeData(updateDataRaw) as Partial<PaymentModel>;

    await this.collection().doc(id).update(updateData);
    
    const updated = await this.collection().doc(id).get();
    return { id: updated.id, ...(updated.data() as Omit<PaymentModel, 'id'>) } as PaymentModel;
  }

  /**
   * Aprueba un pago (alias para updateStatus con verified)
   */
  async verify(id: string, userId: string, notes?: string): Promise<PaymentModel> {
    // Verificar que no exista otro pago verificado para el mismo período de suscripción
    const existingVerified = await this.collection()
      .where('subscriptionId', '==', (await this.getById(id))?.subscriptionId)
      .where('status', '==', 'verified')
      .limit(1)
      .get();

    if (!existingVerified.empty && existingVerified.docs[0].id !== id) {
      throw new Error('Ya existe un pago verificado para esta suscripción');
    }

    return this.updateStatus(id, 'verified', userId, notes);
  }

  /**
   * Rechaza un pago
   */
  async reject(id: string, userId: string, notes?: string): Promise<PaymentModel> {
    return this.updateStatus(id, 'rejected', userId, notes);
  }

  /**
   * Permite reintentar un pago rechazado
   */
  async retry(id: string, userId: string): Promise<PaymentModel> {
    const payment = await this.getById(id);
    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    if (payment.status !== 'rejected') {
      throw new Error('Solo se pueden reintentar pagos rechazados');
    }

    return this.updateStatus(id, 'pending', userId);
  }

  /**
   * Obtiene pagos por ID de suscripción
   */
  async getBySubscriptionId(subscriptionId: string): Promise<PaymentModel[]> {
    const snaps = await this.collection()
      .where('subscriptionId', '==', subscriptionId)
      .orderBy('createdAt', 'desc')
      .get();

    return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({
      id: d.id,
      ...(d.data() as Omit<PaymentModel, 'id'>)
    })) as PaymentModel[];
  }

  /**
   * Obtiene pagos pendientes por método
   */
  async getPendingByMethod(method: string): Promise<PaymentModel[]> {
    const snaps = await this.collection()
      .where('status', '==', 'pending')
      .where('method', '==', method)
      .orderBy('date', 'asc')
      .get();

    return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({
      id: d.id,
      ...(d.data() as Omit<PaymentModel, 'id'>)
    })) as PaymentModel[];
  }

  /**
   * Obtiene estadísticas de pagos
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<{
    total: number;
    pending: number;
    verified: number;
    rejected: number;
    totalAmount: number;
  }> {
    let query: any = this.collection();

    const snaps = await query.get();
    let payments = snaps.docs.map((d: firestore.QueryDocumentSnapshot) => d.data());

    // Filtrar por fecha si se especifica
    if (startDate) {
      payments = payments.filter((p: any) => p.date?.toDate?.() >= startDate);
    }
    if (endDate) {
      payments = payments.filter((p: any) => p.date?.toDate?.() <= endDate);
    }

    const total = payments.length;
    const pending = payments.filter((p: any) => p.status === 'pending').length;
    const verified = payments.filter((p: any) => p.status === 'verified').length;
    const rejected = payments.filter((p: any) => p.status === 'rejected').length;
    const totalAmount = payments
      .filter((p: any) => p.status === 'verified')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return { total, pending, verified, rejected, totalAmount };
  }
}

const paymentService = new PaymentService();
export default paymentService;
