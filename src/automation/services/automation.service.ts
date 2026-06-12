import firebaseAdmin from '../../config/firebaseAdmin';
import communicationsService from '../../communications/services/communications.service';
import billingPeriodService from '../../billingPeriods/services/billingPeriod.service';
import eventBus from '../../events/eventBus';
import { EVENT_BILLING_PERIOD_EVALUATION_REQUEST } from '../../events/domainEvents';
import { Subscription } from '../../subscriptions/models/subscription.model';
import { getTodayInfo } from '../rules/subscription.rules';
import { addDaysTZ, addMonthsTZ } from '../../subscriptions/utils/date.util';

export interface SchedulerConfig {
  cronExpression: string;
  enabled: boolean;
  timeZone: string;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  cronExpression: '0 9 * * *',
  enabled: true,
  timeZone: 'America/Caracas'
};

export interface AutomationRunOptions {
  invokedBy?: string;
  reason?: string;
  dryRun?: boolean;
}

export interface AutomationRunError {
  subscriptionId?: string;
  action: string;
  message: string;
}

export interface AutomationActionDetail {
  subscriptionId: string;
  actions: string[];
  overdue: boolean;
  notes?: string[];
}

export interface AutomationRunResult {
  runDate: string;
  timeZone: string;
  dryRun: boolean;
  processedCount: number;
  notificationsSent: number;
  subscriptionsCut: number;
  subscriptionsActivated: number;
  errors: AutomationRunError[];
  actionDetails: AutomationActionDetail[];
}

class AutomationService {
  private subscriptionPlan(subscription: Subscription) {
    const withPlan = subscription as Subscription & { plan?: string };
    return withPlan.plan || 'Plan';
  }

  private firestore() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore();
  }

  private subscriptionsCollection() {
    return this.firestore().collection('subscriptions');
  }

  private systemCollection() {
    return this.firestore().collection('system');
  }

  async getSchedulerConfig(): Promise<SchedulerConfig & { lastUpdated?: string }> {
    try {
      const doc = await this.systemCollection().doc('automation').get();
      if (!doc.exists) {
        return DEFAULT_SCHEDULER_CONFIG;
      }
      return { ...DEFAULT_SCHEDULER_CONFIG, ...(doc.data() as Partial<SchedulerConfig>) };
    } catch (error) {
      console.error('Error fetching scheduler config', error);
      return DEFAULT_SCHEDULER_CONFIG;
    }
  }

  async updateSchedulerConfig(config: Partial<SchedulerConfig>): Promise<void> {
    await this.systemCollection().doc('automation').set(
      {
        ...config,
        lastUpdated: new Date().toISOString()
      },
      { merge: true }
    );
  }

  async deleteSchedulerConfig(): Promise<void> {
    await this.systemCollection().doc('automation').delete();
  }

  private logsCollection() {
    return this.firestore().collection('automationLogs');
  }

  private fieldValue() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore.FieldValue;
  }

  async runDaily(options?: AutomationRunOptions): Promise<AutomationRunResult> {
    const dryRun = Boolean(options?.dryRun);
    const { todayIso, timeZone } = getTodayInfo();
    const startedAt = Date.now();

    const result: AutomationRunResult = {
      runDate: todayIso,
      timeZone,
      dryRun,
      processedCount: 0,
      notificationsSent: 0,
      subscriptionsCut: 0,
      subscriptionsActivated: 0,
      errors: [],
      actionDetails: []
    };

    const reminderDate = addDaysTZ(todayIso, 3, timeZone);
    await this.processReminders(reminderDate, dryRun, result);
    await this.processCutoffDay(todayIso, dryRun, result);
    await this.processBillingPeriodTransitions(todayIso, dryRun, result);
    await this.processAboutToExpireReminder(addMonthsTZ(todayIso, -1), dryRun, result);

    await this.writeRunLog(result, startedAt, options);
    return result;
  }

  // --- Step 1: Reminder (-3 Days) ---
  private async processReminders(targetDueDate: string, dryRun: boolean, result: AutomationRunResult) {
    const snapshot = await this.firestore()
      .collection('billingPeriods')
      .where('status', '==', 'pending')
      .where('dueDate', '==', targetDueDate)
      .get();

    for (const doc of snapshot.docs) {
      const period = { id: doc.id, ...(doc.data() as any) } as any;
      const subscription = await this.getSubscription(period.subscriptionId);
      if (!subscription) continue;

      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: subscription.id!, actions: [], overdue: false };

      if (dryRun) {
        detail.actions.push('notify-reminder-3days (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await communicationsService.sendTemplate(subscription.clientId || subscription.ownerId || '', 'subscription_reminder_3days_2v', {
            name: 'Cliente',
            dueDate: period.dueDate,
            kitNumber: subscription.kitNumber || 'N/A'
          });
          detail.actions.push('notify-reminder-3days');
          result.notificationsSent++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: subscription.id!, action: 'notify-reminder-3days', message: err.message });
        }
      }
      result.actionDetails.push(detail);
    }
  }

  // --- Step 2: Cutoff Day (Day 0) ---
  private async processCutoffDay(todayIso: string, dryRun: boolean, result: AutomationRunResult) {
    const snapshot = await this.firestore()
      .collection('billingPeriods')
      .where('status', '==', 'pending')
      .where('dueDate', '==', todayIso)
      .get();

    for (const doc of snapshot.docs) {
      const period = { id: doc.id, ...(doc.data() as any) } as any;
      const subscription = await this.getSubscription(period.subscriptionId);
      if (!subscription) continue;

      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: subscription.id!, actions: [], overdue: true };

      if (dryRun) {
        detail.actions.push('notify-cutoff-day (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await communicationsService.sendTemplate(subscription.clientId || subscription.ownerId || '', 'subscription_cutoff_day_2v', {
            name: 'Cliente',
            subscriptionLabel: this.subscriptionPlan(subscription),
            cutoffDate: subscription.nextCutDate || subscription.cutDate,
            kitNumber: subscription.kitNumber || 'N/A'
          });
          detail.actions.push('notify-cutoff-day');
          result.notificationsSent++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: subscription.id!, action: 'notify-cutoff-day', message: err.message });
        }
      }

      detail.actions.push('no-status-change-at-cutoff');
      result.actionDetails.push(detail);
    }
  }

  private async processBillingPeriodTransitions(targetDate: string, dryRun: boolean, result: AutomationRunResult) {
    const periods = await billingPeriodService.findBillingPeriodsToEvaluate(targetDate);

    for (const period of periods) {
      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: period.subscriptionId, actions: [], overdue: true };
      if (dryRun) {
        const actions = await billingPeriodService.evaluateBillingPeriod(period);
        detail.actions.push(`evaluate-state (dry-run): ${actions.map((action) => action.type).join(', ')}`);
      } else {
        try {
          eventBus.emit(EVENT_BILLING_PERIOD_EVALUATION_REQUEST, { period });
          detail.actions.push('emit-billing-period-evaluation-request');
        } catch (err: any) {
          result.errors.push({ subscriptionId: period.subscriptionId, action: 'emit-evaluation-request', message: err.message });
        }
      }

      result.actionDetails.push(detail);
    }
  }

  // --- Step 5: Recordatorio para suscripciones por vencer (3 días antes de suspenderse) ---
  private async processAboutToExpireReminder(targetDueDate: string, dryRun: boolean, result: AutomationRunResult) {
    const snapshot = await this.firestore()
      .collection('billingPeriods')
      .where('status', '==', 'overdue')
      .where('dueDate', '==', targetDueDate)
      .get();

    for (const doc of snapshot.docs) {
      const period = { id: doc.id, ...(doc.data() as any) } as any;
      const subscription = await this.getSubscription(period.subscriptionId);
      if (!subscription) continue;

      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: subscription.id!, actions: [], overdue: true };

      if (dryRun) {
        detail.actions.push('notify-about_to_expire-3days (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await communicationsService.sendTemplate(subscription.clientId || subscription.ownerId || '', 'subscription_about_to_expire_reminder_2v', {
            name: 'Cliente',
            dueDate: period.dueDate,
            kitNumber: subscription.kitNumber || 'N/A'
          });
          detail.actions.push('notify-about_to_expire-3days');
          result.notificationsSent++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: subscription.id!, action: 'notify-about_to_expire-3days', message: err.message });
        }
      }
      result.actionDetails.push(detail);
    }
  }

  private async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const doc = await this.subscriptionsCollection().doc(subscriptionId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Subscription) };
  }

  private async writeRunLog(result: AutomationRunResult, startedAt: number, options?: AutomationRunOptions) {
    if (!firebaseAdmin) return;
    const durationMs = Date.now() - startedAt;
    const FieldValue = this.fieldValue();
    try {
        await this.logsCollection().add({
        runDate: result.runDate,
        timeZone: result.timeZone,
        dryRun: result.dryRun,
        processedCount: result.processedCount,
        notificationsSent: result.notificationsSent,
        subscriptionsCut: result.subscriptionsCut,
        errorCount: result.errors.length,
        startedAt: FieldValue.serverTimestamp(),
        durationMs,
        invokedBy: options?.invokedBy || 'system',
        reason: options?.reason || null,
        detailsPreview: result.actionDetails.slice(0, 10)
        });
    } catch (e) {
        console.error('Failed to write automation log', e);
    }
  }
}

const automationService = new AutomationService();
export default automationService;
