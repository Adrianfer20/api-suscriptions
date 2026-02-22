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
   * Obtiene las fechas de inicio y fin del período mensual actual
   * basado en el cutDate de la suscripción
   */
  private getCurrentMonthPeriod(cutDate: string): { startDate: Date; endDate: Date } {
    const today = new Date();
    const cutDay = parseInt(cutDate, 10);
    
    let startDate: Date;
    let endDate: Date;
    
    if (today.getDate() >= cutDay) {
      // Estamos después del cutDate, el período actual es cutDate actual -> próximo cutDate
      startDate = new Date(today.getFullYear(), today.getMonth(), cutDay);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, cutDay);
    } else {
      // Estamos antes del cutDate, el período actual es cutDate pasado -> cutDate actual
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, cutDay);
      endDate = new Date(today.getFullYear(), today.getMonth(), cutDay);
    }
    
    return { startDate, endDate };
  }

  /**
   * Convierte un valor de fecha a Date de manera segura
   */
  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return null;
  }

  /**
   * Obtiene la suma de pagos verificados en el período mensual actual
   */
  private async getVerifiedPaymentsInCurrentPeriod(subscriptionId: string, cutDate: string): Promise<number> {
    const { startDate, endDate } = this.getCurrentMonthPeriod(cutDate);
    
    const snaps = await this.collection()
      .where('subscriptionId', '==', subscriptionId)
      .where('status', '==', 'verified')
      .get();
    
    let total = 0;
    snaps.docs.forEach((doc) => {
      const data = doc.data();
      const paymentDate = this.toDate(data.date);
      if (paymentDate) {
        if (paymentDate >= startDate && paymentDate < endDate) {
          total += data.amount || 0;
        }
      }
    });
    
    return total;
  }

  /**
   * Obtiene la suma de pagos (verificados + pendientes) en el período mensual actual
   */
  private async getTotalPaymentsInCurrentPeriod(subscriptionId: string, cutDate: string): Promise<number> {
    // Obtener todos los pagos de la suscripción
    const snaps = await this.collection()
      .where('subscriptionId', '==', subscriptionId)
      .get();
    
    const { startDate, endDate } = this.getCurrentMonthPeriod(cutDate);
    
    let total = 0;
    snaps.docs.forEach((doc) => {
      const data = doc.data();
      // Solo considerar pagos verificados o pendientes
      if (data.status === 'verified' || data.status === 'pending') {
        const paymentDate = this.toDate(data.date);
        if (paymentDate) {
          // Verificar si está dentro del período actual
          if (paymentDate >= startDate && paymentDate < endDate) {
            total += data.amount || 0;
          }
        }
      }
    });
    
    return total;
  }

  /**
   * Valida que el monto del pago no exceda la deuda pendiente de la suscripción
   * Esta validación es simple: suma todos los pagos existentes y verifica que no exceda el monthly amount
   */
  private async validateMonthlyLimit(subscriptionId: string, newAmount: number): Promise<void> {
    // Obtener la suscripción
    const subscriptionDoc = await this.subscriptionsCollection().doc(subscriptionId).get();
    if (!subscriptionDoc.exists) {
      throw new Error('Suscripción no encontrada');
    }
    
    const subscription = subscriptionDoc.data();
    if (!subscription) {
      throw new Error('Suscripción no encontrada');
    }
    
    // Parsear el monto de la suscripción (remover $ y convertir a número)
    const monthlyAmount = parseFloat(subscription.amount?.replace(/[^0-9.-]/g, '') || '0');
    
    if (monthlyAmount <= 0) {
      return; // Si no tiene monto definido, no validar
    }
    
    // Obtener todos los pagos existentes (solo pending y verified)
    const snaps = await this.collection()
      .where('subscriptionId', '==', subscriptionId)
      .get();
    
    let existingTotal = 0;
    snaps.docs.forEach((doc) => {
      const data = doc.data();
      // Solo contar pagos pending o verified
      if (data.status === 'pending' || data.status === 'verified') {
        existingTotal += data.amount || 0;
      }
    });
    
    // Calcular el nuevo total
    const newTotal = existingTotal + newAmount;
    
    // Validar que no exceda el monthly amount
    if (newTotal > monthlyAmount) {
      throw new Error(
        `El monto excede el límite mensual. Costo mensual: ${monthlyAmount}. ` +
        `Ya registrado: ${existingTotal}. ` +
        `Monto máximo permitido: ${monthlyAmount - existingTotal}`
      );
    }
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

    // Validar que el monto no exceda el límite mensual
    if (!data.free) {
      await this.validateMonthlyLimit(data.subscriptionId, data.amount);
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
    // Obtener el pago primero
    const payment = await this.getById(id);
    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    // Obtener la suscripción para validar y actualizar
    const subscriptionDoc = await this.subscriptionsCollection().doc(payment.subscriptionId).get();
    if (subscriptionDoc.exists) {
      const subscription = subscriptionDoc.data();
      const monthlyAmount = parseFloat(subscription?.amount?.replace(/[^0-9.-]/g, '') || '0');

      if (monthlyAmount > 0) {
        // Obtener todos los pagos existentes (verificados + pendientes) EXCEPTO el que se está verificando
        const snaps = await this.collection()
          .where('subscriptionId', '==', payment.subscriptionId)
          .get();
        
        let existingTotal = 0;
        snaps.docs.forEach((doc) => {
          const data = doc.data();
          // Excluir el pago actual de la suma
          if (doc.id !== id && (data.status === 'pending' || data.status === 'verified')) {
            existingTotal += data.amount || 0;
          }
        });
        
        // Validar que la suma total no exceda el monthly amount
        const newTotal = existingTotal + payment.amount;
        if (newTotal > monthlyAmount) {
          throw new Error(
            `No se puede verificar. El monto excede el límite mensual. Costo mensual: ${monthlyAmount}. ` +
            `Otros pagos: ${existingTotal}. Este pago: ${payment.amount}. Total: ${newTotal}`
          );
        }
      }

      // Actualizar suscripción: siempre a active, y cutDate si el pago cubre el mes completo
      const updateSubscriptionData: Record<string, unknown> = {
        status: 'active',
      };

      // Si el monthly amount está completamente pagado, avanzar cutDate
      // Simplificado: solo verificar si la suma total de pagos (sin período) >= monthlyAmount
      const monthlyAmountValue = parseFloat(subscription?.amount?.replace(/[^0-9.-]/g, '') || '0');
      
      // Obtener todos los pagos verificados de esta suscripción
      const allPaymentsSnap = await this.collection()
        .where('subscriptionId', '==', payment.subscriptionId)
        .where('status', '==', 'verified')
        .get();
      
      let allVerifiedTotal = 0;
      allPaymentsSnap.docs.forEach((doc) => {
        const data = doc.data();
        allVerifiedTotal += data.amount || 0;
      });
      
      // Si todos los pagos verificados cubren el mes, avanzar cutDate
      // INCLUIR el pago que se está verificando actualmente
      const allVerifiedTotalWithCurrent = allVerifiedTotal + payment.amount;
      console.log('[PaymentService] Verificando cutDate:', { allVerifiedTotal, paymentAmount: payment.amount, total: allVerifiedTotalWithCurrent, monthlyAmountValue });
      
      if (monthlyAmountValue > 0 && allVerifiedTotalWithCurrent >= monthlyAmountValue) {
        console.log('[PaymentService] Actualizando cutDate - Pago completo');
        const cutDateParts = (subscription?.cutDate || '').split('-');
        const day = cutDateParts.length === 3 ? parseInt(cutDateParts[2], 10) : 1;
        const today = new Date();
        
        // Calcular nuevo cutDate (mes siguiente)
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, day);
        const newCutDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        updateSubscriptionData.cutDate = newCutDate;
      } else {
        console.log('[PaymentService] NO actualiza cutDate:', { allVerifiedTotal, monthlyAmountValue });
      }

      console.log('[PaymentService] updateSubscriptionData:', updateSubscriptionData);
      await this.subscriptionsCollection().doc(payment.subscriptionId).update(updateSubscriptionData);
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
      payments = payments.filter((p: any) => {
        const d = this.toDate(p.date);
        return d ? d >= startDate : false;
      });
    }
    if (endDate) {
      payments = payments.filter((p: any) => {
        const d = this.toDate(p.date);
        return d ? d <= endDate : false;
      });
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
