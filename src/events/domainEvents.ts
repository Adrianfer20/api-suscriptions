export const EVENT_PAYMENT_VERIFIED = 'PAYMENT_VERIFIED';
export const EVENT_BILLING_PERIOD_PAID = 'BILLING_PERIOD_PAID';
export const EVENT_BILLING_PERIOD_OVERDUE = 'BILLING_PERIOD_OVERDUE';
export const EVENT_SUBSCRIPTION_SUSPENDED = 'SUBSCRIPTION_SUSPENDED';
export const EVENT_BILLING_PERIOD_EVALUATION_REQUEST = 'BILLING_PERIOD_EVALUATION_REQUEST';

export type DomainEventType =
  | typeof EVENT_PAYMENT_VERIFIED
  | typeof EVENT_BILLING_PERIOD_PAID
  | typeof EVENT_BILLING_PERIOD_OVERDUE
  | typeof EVENT_SUBSCRIPTION_SUSPENDED
  | typeof EVENT_BILLING_PERIOD_EVALUATION_REQUEST;

export interface PaymentVerifiedEvent {
  payment: any;
}

export interface BillingPeriodEvent {
  period: any;
}

export interface DomainEventPayloads {
  PAYMENT_VERIFIED: PaymentVerifiedEvent;
  BILLING_PERIOD_PAID: BillingPeriodEvent;
  BILLING_PERIOD_OVERDUE: BillingPeriodEvent;
  SUBSCRIPTION_SUSPENDED: BillingPeriodEvent;
  BILLING_PERIOD_EVALUATION_REQUEST: BillingPeriodEvent;
}
