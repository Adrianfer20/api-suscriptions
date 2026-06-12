export type BillingPeriodStatus = 'pending' | 'paid' | 'overdue' | 'suspended';

export interface BillingPeriod {
  id?: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel?: string;
  dueDate: string;
  amount: number;
  status: BillingPeriodStatus;
  paidAt?: string;
  daysLate?: number;
  createdAt?: any;
  updatedAt?: any;
}
