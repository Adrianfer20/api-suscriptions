export type SubscriptionStatus =
  | 'active'
  | 'about_to_expire'
  | 'suspended'
  | 'paused'
  | 'cancelled';

export interface Subscription {
  id?: string;
  ownerId?: string;
  clientId?: string; // legacy compatibility
  startDate?: string; // ISO date yyyy-mm-dd
  plan: Plan;
  amount: number | string; // numeric amount preferred; strings supported for legacy records
  kitNumber?: string; // e.g. "KIT4M01422983C2H" or "Valor No Disponible"
  passwordSub?: string;
  cycleDay?: number;
  cutDate?: string; // legacy alias for nextCutDate
  nextCutDate?: string; // ISO date yyyy-mm-dd
  status: SubscriptionStatus;
  country?: string; // country abbreviation (e.g. "VES")
  createdAt?: any;
  updatedAt?: any;
}

export type Plan = 'Itinerante Ilimitado' | 'Itinerante 100GB' | 'Residencial';
