export type SubscriptionStatus =
  | 'active'
  | 'about_to_expire'
  | 'suspended'
  | 'paused'
  | 'cancelled';

export interface Subscription {
  id?: string;
  clientId: string; // either client doc id or client.uid
  startDate: string; // ISO date yyyy-mm-dd
  cutDate: string; // ISO date yyyy-mm-dd
  plan: string;
  amount: string; // currency string (e.g. "$50")
  kitNumber?: string; // e.g. "KIT4M01422983C2H" or "Valor No Disponible"
  passwordSub?: string;
  status: SubscriptionStatus;
  country: string; // country abbreviation (e.g. "VES")
  createdAt?: any;
  updatedAt?: any;
}
