import eventBus from './eventBus';
import communicationsService from '../communications/services/communications.service';
import {
  EVENT_SUBSCRIPTION_SUSPENDED,
  EVENT_BILLING_PERIOD_PAID,
  EVENT_BILLING_PERIOD_OVERDUE,
  EVENT_PAYMENT_VERIFIED
} from './domainEvents';

/* listeners should remain thin: delegate heavy work to services */

const logBillingPeriodPaid = async (period: any) => {
  console.log(`[EventListeners] Billing period paid: ${period.id} for subscription ${period.subscriptionId}`);
};

const logBillingPeriodOverdue = async (period: any) => {
  console.log(`[EventListeners] Billing period overdue: ${period.id} for subscription ${period.subscriptionId}`);
};

export const registerEventListeners = () => {
  eventBus.on(EVENT_PAYMENT_VERIFIED, async ({ payment }: any) => {
    console.log('[EventListeners] PAYMENT_VERIFIED event received for payment', payment.id);
  });

  eventBus.on(EVENT_BILLING_PERIOD_PAID, async ({ period }: any) => {
    try {
      await communicationsService.notifyBillingPeriodPaid(period);
    } catch (err: any) {
      console.error('[EventListeners] notifyBillingPeriodPaid failed', err?.message || err);
    }
  });

  eventBus.on(EVENT_BILLING_PERIOD_OVERDUE, async ({ period }: any) => {
    try {
      await communicationsService.notifyBillingPeriodOverdue(period);
    } catch (err: any) {
      console.error('[EventListeners] notifyBillingPeriodOverdue failed', err?.message || err);
    }
  });

  eventBus.on(EVENT_SUBSCRIPTION_SUSPENDED, async ({ period }: any) => {
    try {
      await communicationsService.notifySubscriptionSuspended(period);
    } catch (err: any) {
      console.error('[EventListeners] notifySubscriptionSuspended failed', err?.message || err);
    }
  });
};

registerEventListeners();
