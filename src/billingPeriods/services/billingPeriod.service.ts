import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { BillingPeriod, BillingPeriodStatus } from '../models/billingPeriod.model';
import paymentService from '../../payments/services/payment.service';
import { CreatePaymentInput } from '../../payments/validators/payment.schema';
import { CreateBillingPeriodInput } from '../validators/billingPeriod.schema';
import { addMonthsTZ, startOfDayTZ } from '../../subscriptions/utils/date.util';

export interface BillingPeriodFilters {
  subscriptionId?: string;
  status?: BillingPeriodStatus;
  page?: number;
  limit?: number;
}

class BillingPeriodService {
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

    const paidAmount = await this.getVerifiedPaymentsTotal(id);
    const updates: Record<string, unknown> = {
      updatedAt: this.fieldValue().serverTimestamp()
    };

    if (paidAmount >= period.amount) {
      updates.status = 'paid';
      updates.paidAt = new Date().toISOString();
    }

    await this.collection().doc(id).update(this.sanitizeData(updates));
    const updatedPeriodDoc = await this.collection().doc(id).get();
    const updatedPeriod = { id: updatedPeriodDoc.id, ...(updatedPeriodDoc.data() as any) } as BillingPeriod;

    const result: { payment: any; billingPeriod: BillingPeriod; nextPeriod?: BillingPeriod } = {
      payment,
      billingPeriod: updatedPeriod
    };

    if (updatedPeriod.status === 'paid') {
      const nextPeriod = await this.create({
        subscriptionId: period.subscriptionId,
        periodStart: period.periodEnd,
        periodEnd: addMonthsTZ(period.periodEnd, 1),
        dueDate: addMonthsTZ(period.dueDate, 1),
        amount: period.amount,
        status: 'pending'
      });

      if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
      await firebaseAdmin.firestore().collection('subscriptions').doc(period.subscriptionId).update({
        nextCutDate: nextPeriod.dueDate,
        updatedAt: this.fieldValue().serverTimestamp()
      });

      result.nextPeriod = nextPeriod;
    }

    return result;
  }
}

const billingPeriodService = new BillingPeriodService();
export default billingPeriodService;
