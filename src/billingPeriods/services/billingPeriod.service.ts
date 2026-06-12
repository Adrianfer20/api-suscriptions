import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { BillingPeriod, BillingPeriodStatus } from '../models/billingPeriod.model';
import paymentService from '../../payments/services/payment.service';
import { CreatePaymentInput } from '../../payments/validators/payment.schema';
import { PaymentModel } from '../../payments/models/payment.model';
import { SubscriptionStatus } from '../../subscriptions/models/subscription.model';
import { CreateBillingPeriodInput } from '../validators/billingPeriod.schema';
import { addMonthsTZ, startOfDayTZ } from '../../subscriptions/utils/date.util';
import eventBus from '../../events/eventBus';
import {
  EVENT_BILLING_PERIOD_OVERDUE,
  EVENT_BILLING_PERIOD_PAID,
  EVENT_PAYMENT_VERIFIED,
  EVENT_SUBSCRIPTION_SUSPENDED
  , EVENT_BILLING_PERIOD_EVALUATION_REQUEST
} from '../../events/domainEvents';

export type BillingPeriodEvaluationActionType =
  | 'MARK_OVERDUE'
  | 'SUSPEND_SUBSCRIPTION'
  | 'CREATE_NEXT_PERIOD'
  | 'NO_ACTION';

export interface BillingPeriodEvaluationAction {
  type: BillingPeriodEvaluationActionType;
  reason?: string;
}

export interface BillingPeriodFilters {
  subscriptionId?: string;
  status?: BillingPeriodStatus;
  page?: number;
  limit?: number;
}

class BillingPeriodService {
  constructor() {
    eventBus.on(EVENT_PAYMENT_VERIFIED, async ({ payment }: any) => {
      try {
        if (!payment || !payment.billingPeriodId) return;
        await this.applyPayment(payment);
      } catch (error: any) {
        console.error('[BillingPeriodService] Error processing PAYMENT_VERIFIED event', error?.message || error);
      }
    });

    eventBus.on(EVENT_BILLING_PERIOD_EVALUATION_REQUEST, async ({ period }: any) => {
      try {
        if (!period || !period.id) return;
        const actions = await this.evaluateBillingPeriod(period);
        await this.applyBillingPeriodActions(period, actions);
      } catch (error: any) {
        console.error('[BillingPeriodService] Error processing BILLING_PERIOD_EVALUATION_REQUEST event', error?.message || error);
      }
    });
  }

  private collection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('billingPeriods');
  }

  private paymentsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('payments');
  }

  private fieldValue() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore.FieldValue;
  }

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
    }
    return result;
  }

  private formatPeriodLabel(periodStart: string, periodEnd: string): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startDate = new Date(`${periodStart}T00:00:00Z`);
    const endDate = new Date(`${periodEnd}T00:00:00Z`);
    const startLabel = monthNames[startDate.getUTCMonth()];
    const endLabel = monthNames[endDate.getUTCMonth()];
    const year = startDate.getUTCFullYear();
    return `${startLabel}-${endLabel} ${year}`;
  }

  private computeDaysLate(dueDate: string): number {
    const today = new Date(`${startOfDayTZ(new Date())}T00:00:00Z`);
    const due = new Date(`${dueDate}T00:00:00Z`);
    if (due >= today) return 0;
    const diff = today.getTime() - due.getTime();
    return Math.floor(diff / 86400000);
  }

  private normalizeBillingPeriod(raw: any): BillingPeriod {
    const period: BillingPeriod = {
      id: raw.id,
      subscriptionId: raw.subscriptionId,
      periodStart: raw.periodStart,
      periodEnd: raw.periodEnd,
      periodLabel: raw.periodLabel || this.formatPeriodLabel(raw.periodStart, raw.periodEnd),
      dueDate: raw.dueDate,
      amount: raw.amount,
      status: raw.status,
      paidAt: raw.paidAt,
      daysLate: raw.daysLate !== undefined ? raw.daysLate : this.computeDaysLate(raw.dueDate),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
    return period;
  }

  async create(data: CreateBillingPeriodInput): Promise<BillingPeriod> {
    const now = this.fieldValue().serverTimestamp();
    const periodLabel = this.formatPeriodLabel(data.periodStart, data.periodEnd);
    const daysLate = this.computeDaysLate(data.dueDate);

    const docRef = await this.collection().add({
      subscriptionId: data.subscriptionId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      periodLabel,
      dueDate: data.dueDate,
      amount: data.amount,
      status: data.status || 'pending',
      paidAt: null,
      daysLate,
      createdAt: now,
      updatedAt: now
    });
    const snap = await docRef.get();
    return this.normalizeBillingPeriod({ id: docRef.id, ...(snap.data() as any) });
  }

  async list(filters: BillingPeriodFilters) {
    let query: any = this.collection().orderBy('dueDate', 'desc');
    if (filters.subscriptionId) {
      query = query.where('subscriptionId', '==', filters.subscriptionId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const snapshot = await query.get();
    const total = snapshot.docs.length;

    const docs = snapshot.docs.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      billingPeriods: docs.map((doc: firestore.QueryDocumentSnapshot) =>
        this.normalizeBillingPeriod({ id: doc.id, ...(doc.data() as any) })
      ),
      total,
      page,
      limit,
      hasMore
    };
  }

  async getById(id: string): Promise<BillingPeriod | null> {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    return this.normalizeBillingPeriod({ id: doc.id, ...(doc.data() as any) });
  }

  async update(id: string, patch: Partial<BillingPeriod>): Promise<BillingPeriod> {
    const data = this.sanitizeData({ ...patch, updatedAt: this.fieldValue().serverTimestamp() });
    await this.collection().doc(id).update(data);
    const updated = await this.collection().doc(id).get();
    return { id: updated.id, ...(updated.data() as any) } as BillingPeriod;
  }

  async delete(id: string): Promise<boolean> {
    await this.collection().doc(id).delete();
    return true;
  }

  private async getVerifiedPaymentsTotal(billingPeriodId: string): Promise<number> {
    const snaps = await this.paymentsCollection()
      .where('billingPeriodId', '==', billingPeriodId)
      .where('status', '==', 'verified')
      .get();

    return snaps.docs.reduce((sum, doc) => {
      const data = doc.data() as any;
      return sum + (data.amount || 0);
    }, 0);
  }

  private subscriptionsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('subscriptions');
  }

  private async getLatestBillingPeriod(subscriptionId: string): Promise<BillingPeriod | null> {
    const snapshots = await this.collection()
      .where('subscriptionId', '==', subscriptionId)
      .orderBy('dueDate', 'desc')
      .limit(1)
      .get();

    if (snapshots.empty) return null;
    const doc = snapshots.docs[0];
    return this.normalizeBillingPeriod({ id: doc.id, ...(doc.data() as any) });
  }

  async findBillingPeriodsToEvaluate(targetDate: string): Promise<BillingPeriod[]> {
    const baseQuery = this.collection().where('dueDate', '<=', targetDate);
    const [pendingSnap, overdueSnap] = await Promise.all([
      baseQuery.where('status', '==', 'pending').get(),
      baseQuery.where('status', '==', 'overdue').get()
    ]);

    return [...pendingSnap.docs, ...overdueSnap.docs].map((doc) =>
      this.normalizeBillingPeriod({ id: doc.id, ...(doc.data() as any) })
    );
  }

  private async hasFutureBillingPeriod(period: BillingPeriod): Promise<boolean> {
    const snapshot = await this.collection()
      .where('subscriptionId', '==', period.subscriptionId)
      .where('dueDate', '>', period.dueDate)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Valida que un nuevo pago no exceda el monto mensual de la suscripción.
   * Si `excludePaymentId` está presente, ese pago no se contará en el total.
   */
  async validateMonthlyLimit(subscriptionId: string, newAmount: number, excludePaymentId?: string): Promise<void> {
    const subDoc = await this.subscriptionsCollection().doc(subscriptionId).get();
    if (!subDoc.exists) throw new Error('Suscripción no encontrada');
    const subscription = subDoc.data() as any;

    const monthlyAmount = typeof subscription.amount === 'number'
      ? subscription.amount
      : parseFloat(String(subscription.amount).replace(/[^0-9.-]/g, '') || '0');

    if (monthlyAmount <= 0) return;

    const snaps = await this.paymentsCollection()
      .where('subscriptionId', '==', subscriptionId)
      .get();

    let existingTotal = 0;
    snaps.docs.forEach((doc) => {
      if (doc.id === excludePaymentId) return;
      const data = doc.data() as any;
      if (data.status === 'pending' || data.status === 'verified') {
        existingTotal += data.amount || 0;
      }
    });

    const newTotal = existingTotal + (newAmount || 0);
    if (newTotal > monthlyAmount) {
      throw new Error(`El monto excede el límite mensual. Costo mensual: ${monthlyAmount}. Ya registrado: ${existingTotal}. Monto máximo permitido: ${monthlyAmount - existingTotal}`);
    }
  }

  async evaluateBillingPeriod(period: BillingPeriod): Promise<BillingPeriodEvaluationAction[]> {
    const daysLate = this.computeDaysLate(period.dueDate);
    const actions: BillingPeriodEvaluationAction[] = [];

    if (period.status === 'pending' && daysLate > 0) {
      actions.push({ type: 'MARK_OVERDUE', reason: 'dueDate passed' });
    }

    if (period.status === 'overdue' && daysLate > 30) {
      actions.push({ type: 'SUSPEND_SUBSCRIPTION', reason: 'overdue more than 30 days' });
    }

    if (period.status === 'paid') {
      const hasFuture = await this.hasFutureBillingPeriod(period);
      if (!hasFuture) {
        actions.push({ type: 'CREATE_NEXT_PERIOD', reason: 'paid period without next billing period' });
      }
    }

    if (actions.length === 0) {
      actions.push({ type: 'NO_ACTION' });
    }

    return actions;
  }

  async applyBillingPeriodActions(
    period: BillingPeriod,
    actions: BillingPeriodEvaluationAction[]
  ): Promise<BillingPeriod | undefined> {
    let nextPeriod: BillingPeriod | undefined;

    for (const action of actions) {
      switch (action.type) {
        case 'MARK_OVERDUE':
          await this.markBillingPeriodOverdue(period.id!);
          break;
        case 'SUSPEND_SUBSCRIPTION':
          await this.markBillingPeriodSuspended(period.id!);
          break;
        case 'CREATE_NEXT_PERIOD':
          nextPeriod = await this.createNextPeriodForPaidBillingPeriod(period);
          break;
        case 'NO_ACTION':
        default:
          break;
      }
    }

    return nextPeriod;
  }

  private async createNextPeriodForPaidBillingPeriod(period: BillingPeriod): Promise<BillingPeriod | undefined> {
    if (period.status !== 'paid') return undefined;
    if (await this.hasFutureBillingPeriod(period)) return undefined;

    const nextPeriod = await this.create({
      subscriptionId: period.subscriptionId,
      periodStart: period.periodEnd,
      periodEnd: addMonthsTZ(period.periodEnd, 1),
      dueDate: addMonthsTZ(period.dueDate, 1),
      amount: period.amount,
      status: 'pending'
    });

    await this.syncSubscriptionNextCutDate(period.subscriptionId, nextPeriod.dueDate);
    await this.updateSubscriptionStateFromLatestPeriod(period.subscriptionId);

    return nextPeriod;
  }

  private deriveSubscriptionStatus(latestPeriod: BillingPeriod | null): SubscriptionStatus {
    if (!latestPeriod) return 'active';

    switch (latestPeriod.status) {
      case 'paid':
      case 'pending':
        return 'active';
      case 'overdue':
        return 'about_to_expire';
      case 'suspended':
        return 'suspended';
      default:
        return 'active';
    }
  }

  private async updateSubscriptionStateFromLatestPeriod(subscriptionId: string): Promise<void> {
    const latestPeriod = await this.getLatestBillingPeriod(subscriptionId);
    const status = this.deriveSubscriptionStatus(latestPeriod);

    await this.subscriptionsCollection().doc(subscriptionId).update({
      status,
      updatedAt: this.fieldValue().serverTimestamp()
    });
  }

  private async syncSubscriptionNextCutDate(subscriptionId: string, nextCutDate: string): Promise<void> {
    await this.subscriptionsCollection().doc(subscriptionId).update({
      nextCutDate,
      cutDate: nextCutDate,
      status: 'active',
      updatedAt: this.fieldValue().serverTimestamp()
    });
  }

  async applyPayment(payment: PaymentModel) {
    if (!payment.billingPeriodId || payment.status !== 'verified') {
      return { payment, billingPeriod: null as BillingPeriod | null };
    }

    const period = await this.getById(payment.billingPeriodId);
    if (!period) throw new Error('Billing period not found for payment');

    const paidAmount = await this.getVerifiedPaymentsTotal(payment.billingPeriodId);
    const updates: Record<string, unknown> = {
      updatedAt: this.fieldValue().serverTimestamp()
    };

    if (paidAmount >= period.amount) {
      updates.status = 'paid';
      updates.paidAt = new Date().toISOString();
    }

    await this.collection().doc(payment.billingPeriodId).update(this.sanitizeData(updates));
    const updatedPeriod = await this.getById(payment.billingPeriodId);
    if (!updatedPeriod) throw new Error('Billing period not found after update');

    let nextPeriod: BillingPeriod | undefined;
    if (updatedPeriod.status === 'paid') {
      const actions = await this.evaluateBillingPeriod(updatedPeriod);
      nextPeriod = await this.applyBillingPeriodActions(updatedPeriod, actions);
      eventBus.emit(EVENT_BILLING_PERIOD_PAID, { period: updatedPeriod });
    } else {
      await this.updateSubscriptionStateFromLatestPeriod(period.subscriptionId);
    }

    return { payment, billingPeriod: updatedPeriod, nextPeriod };
  }

  async payBillingPeriod(id: string, paymentInput: Omit<CreatePaymentInput, 'subscriptionId'>, userId: string) {
    const period = await this.getById(id);
    if (!period) throw new Error('Billing period not found');
    if (period.status === 'paid') throw new Error('Billing period is already paid');

    const paymentData: CreatePaymentInput = {
      ...paymentInput,
      subscriptionId: period.subscriptionId,
      billingPeriodId: id
    } as CreatePaymentInput;

    const payment = await paymentService.create(paymentData, userId, true, userId);
    const result = await this.applyPayment(payment);

    return result;
  }

  async markBillingPeriodOverdue(id: string): Promise<BillingPeriod> {
    const period = await this.getById(id);
    if (!period) throw new Error('Billing period not found');
    if (period.status !== 'pending') return period;

    await this.collection().doc(id).update({
      status: 'overdue',
      updatedAt: this.fieldValue().serverTimestamp()
    });

    const updatedPeriod = await this.getById(id);
    if (!updatedPeriod) throw new Error('Billing period not found after overdue update');
    await this.updateSubscriptionStateFromLatestPeriod(updatedPeriod.subscriptionId);
    eventBus.emit(EVENT_BILLING_PERIOD_OVERDUE, { period: updatedPeriod });
    return updatedPeriod;
  }

  async markBillingPeriodSuspended(id: string): Promise<BillingPeriod> {
    const period = await this.getById(id);
    if (!period) throw new Error('Billing period not found');
    if (period.status === 'suspended' || period.status === 'paid') return period;

    await this.collection().doc(id).update({
      status: 'suspended',
      updatedAt: this.fieldValue().serverTimestamp()
    });

    const updatedPeriod = await this.getById(id);
    if (!updatedPeriod) throw new Error('Billing period not found after suspended update');
    await this.updateSubscriptionStateFromLatestPeriod(updatedPeriod.subscriptionId);
    eventBus.emit(EVENT_SUBSCRIPTION_SUSPENDED, { period: updatedPeriod });
    return updatedPeriod;
  }
}

const billingPeriodService = new BillingPeriodService();
export default billingPeriodService;
