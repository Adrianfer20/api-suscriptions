export type SubscriptionStatus = 'active' | 'suspended' | 'inactive';

export interface Subscription {
  id?: string;
  clientId: string; // either client doc id or client.uid
  startDate: string; // ISO date yyyy-mm-dd
  cutDate: string; // ISO date yyyy-mm-dd
  plan: string;
  amount: string; // currency string (e.g. "$50")
  passwordSub?: string;
  status: SubscriptionStatus;
  createdAt?: any;
  updatedAt?: any;
}
