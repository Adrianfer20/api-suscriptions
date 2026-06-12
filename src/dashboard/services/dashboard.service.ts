import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { BillingPeriod } from '../../billingPeriods/models/billingPeriod.model';

export interface DashboardSummary {
  active: number;
  pendingPayments: number;
  overdue: number;
  suspended: number;
  paidThisMonth: number;
  revenueThisMonth: number;
}

export interface DashboardBillingPeriods {
  [periodLabel: string]: {
    paid: BillingPeriod[];
    pending: BillingPeriod[];
    overdue: BillingPeriod[];
  };
}

class DashboardService {
  private firestore() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore();
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  async getSummary(): Promise<DashboardSummary> {
    const db = this.firestore();

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const [activeSnap, suspendedSnap, pendingSnap, overdueSnap, paymentsSnap] = await Promise.all([
      db.collection('subscriptions').where('status', '==', 'active').get(),
      db.collection('subscriptions').where('status', '==', 'suspended').get(),
      db.collection('billingPeriods').where('status', '==', 'pending').get(),
      db.collection('billingPeriods').where('status', '==', 'overdue').get(),
      db.collection('payments').where('status', '==', 'verified').get()
    ]);

    let paidThisMonth = 0;
    let revenueThisMonth = 0;
    paymentsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const date = this.toDate(data.date);
      if (!date) return;
      if (date >= monthStart && date < nextMonthStart) {
        paidThisMonth += 1;
        revenueThisMonth += data.amount || 0;
      }
    });

    return {
      active: activeSnap.docs.length,
      pendingPayments: pendingSnap.docs.length,
      overdue: overdueSnap.docs.length,
      suspended: suspendedSnap.docs.length,
      paidThisMonth,
      revenueThisMonth
    };
  }

  async getBillingPeriodsGrouped(): Promise<DashboardBillingPeriods> {
    const snapshot = await this.firestore()
      .collection('billingPeriods')
      .orderBy('periodStart', 'asc')
      .get();

    const groups: DashboardBillingPeriods = {};

    snapshot.docs.forEach((doc) => {
      const raw = { id: doc.id, ...(doc.data() as any) } as BillingPeriod;
      const label = raw.periodLabel || `${raw.periodStart} / ${raw.periodEnd}`;
      if (!groups[label]) {
        groups[label] = { paid: [], pending: [], overdue: [] };
      }
      if (raw.status === 'paid') groups[label].paid.push(raw);
      else if (raw.status === 'overdue') groups[label].overdue.push(raw);
      else groups[label].pending.push(raw);
    });

    return groups;
  }
}

const dashboardService = new DashboardService();
export default dashboardService;
