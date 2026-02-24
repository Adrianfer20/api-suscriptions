import firebaseAdmin from '../../config/firebaseAdmin';
import communicationsService from '../../communications/services/communications.service';
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

    // 1. Process Reminders (3 days BEFORE cut)
    // Formula: cutDate == today + 3
    const reminderDate = addDaysTZ(todayIso, 3, timeZone);
    await this.processReminders(reminderDate, dryRun, result);

    // 2. Process Cutoff Day (Day 0)
    // Formula: cutDate == today. Active subscriptions.
    // Action: Notify Cutoff (no immediate status change; month-based rules handle overdue state transitions).
    await this.processCutoffDay(todayIso, dryRun, result);

    // 4. Overdue rules: 1 month overdue -> about_to_expire, 2 months overdue -> suspended
    await this.processMonth1Overdue(addMonthsTZ(todayIso, -1), dryRun, result);
    await this.processMonth2Overdue(addMonthsTZ(todayIso, -2), dryRun, result);

    await this.writeRunLog(result, startedAt, options);
    return result;
  }

  // --- Step 1: Reminder (-3 Days) ---
  private async processReminders(targetCutDate: string, dryRun: boolean, result: AutomationRunResult) {
    const snapshot = await this.subscriptionsCollection()
      .where('status', '==', 'active')
      .where('cutDate', '==', targetCutDate)
      .get();

    for (const doc of snapshot.docs) {
      const sub = { id: doc.id, ...(doc.data() as Subscription) };
      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: sub.id!, actions: [], overdue: false };

      if (dryRun) {
        detail.actions.push('notify-reminder-3days (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await communicationsService.sendTemplate(sub.clientId, 'subscription_reminder_3days_2v', {
            name: 'Cliente', 
            dueDate: sub.cutDate
          });
          detail.actions.push('notify-reminder-3days');
          result.notificationsSent++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: sub.id, action: 'notify-reminder-3days', message: err.message });
        }
      }
      result.actionDetails.push(detail);
    }
  }

  // --- Step 2: Cutoff Day (Day 0) ---
  private async processCutoffDay(todayIso: string, dryRun: boolean, result: AutomationRunResult) {
    // We look for active subscriptions that expire TODAY (or strictly before today if missed run?)
    // Let's stick to strict TODAY for notifications to avoid spamming old ones, 
    // but we might want to close old ones. For now: Strict today as per "3 notifications" request.
    const snapshot = await this.subscriptionsCollection()
      .where('status', '==', 'active')
      .where('cutDate', '==', todayIso)
      .get();

    for (const doc of snapshot.docs) {
      const sub = { id: doc.id, ...(doc.data() as Subscription) };
      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: sub.id!, actions: [], overdue: true };

      // 1. Notify "It's cutoff day"
      if (dryRun) {
        detail.actions.push('notify-cutoff-day (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await communicationsService.sendTemplate(sub.clientId, 'subscription_cutoff_day_2v', {
            name: 'Cliente',
            subscriptionLabel: this.subscriptionPlan(sub),
            cutoffDate: sub.cutDate
          });
          detail.actions.push('notify-cutoff-day');
          result.notificationsSent++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: sub.id, action: 'notify-cutoff-day', message: err.message });
        }
      }

      // 2. No automatic status change at cutoff day; month-based processors will handle overdue transitions
      // 2. No automatic status change at cutoff day; overdue rules handle month-based transitions.
      detail.actions.push('no-status-change-at-cutoff');

      result.actionDetails.push(detail);
    }
  }

  // --- Step 3: Suspended Notice (Day +1) ---
  private async processMonth1Overdue(targetCutDate: string, dryRun: boolean, result: AutomationRunResult) {
    // 1 month after cutDate -> mark as about_to_expire and notify
    const snapshot = await this.subscriptionsCollection()
      .where('status', '==', 'active')
      .where('cutDate', '==', targetCutDate)
      .get();

    for (const doc of snapshot.docs) {
      const sub = { id: doc.id, ...(doc.data() as Subscription) };
      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: sub.id!, actions: [], overdue: true };

      if (dryRun) {
        detail.actions.push('mark-about_to_expire (dry-run)');
      } else {
        try {
          await this.updateSubscriptionStatus(sub.id!, 'about_to_expire');
          detail.actions.push('mark-about_to_expire');
        } catch (err: any) {
          result.errors.push({ subscriptionId: sub.id, action: 'mark-about_to_expire', message: err.message });
        }
      }
      result.actionDetails.push(detail);
    }
  }

  private async processMonth2Overdue(targetCutDate: string, dryRun: boolean, result: AutomationRunResult) {
    // 2 months after cutDate -> mark as suspended and notify
    const snapshot = await this.subscriptionsCollection()
      .where('cutDate', '==', targetCutDate)
      .get();

    for (const doc of snapshot.docs) {
      const sub = { id: doc.id, ...(doc.data() as Subscription) };
      // skip if already suspended/cancelled/paused
      if (sub.status === 'suspended' || sub.status === 'cancelled' || sub.status === 'paused') continue;
      result.processedCount++;
      const detail: AutomationActionDetail = { subscriptionId: sub.id!, actions: [], overdue: true };

      if (dryRun) {
        detail.actions.push('mark-suspended (dry-run)');
        result.notificationsSent++;
      } else {
        try {
          await this.updateSubscriptionStatus(sub.id!, 'suspended');
          detail.actions.push('mark-suspended');
          // send suspended notice
          try {
            await communicationsService.sendTemplate(sub.clientId, 'subscription_suspended_notice_2v', {
              name: 'Cliente',
              subscriptionLabel: this.subscriptionPlan(sub)
            });
            detail.actions.push('notify-suspended');
            result.notificationsSent++;
          } catch (err: any) {
            // collect but continue
            result.errors.push({ subscriptionId: sub.id, action: 'notify-suspended', message: err.message });
          }
          result.subscriptionsCut++;
        } catch (err: any) {
          result.errors.push({ subscriptionId: sub.id, action: 'mark-suspended', message: err.message });
        }
      }
      result.actionDetails.push(detail);
    }
  }

  private async updateSubscriptionStatus(id: string, status: Subscription['status']) {
    await this.subscriptionsCollection()
      .doc(id)
      .update({
        status,
        updatedAt: this.fieldValue().serverTimestamp()
      });
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
