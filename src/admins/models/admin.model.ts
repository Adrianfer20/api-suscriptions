export interface Admin {
  id?: string;
  uid: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  roles?: string[];
  active?: boolean;
  notes?: string;
  subscriptionIds?: string[];
  createdAt?: any;
  updatedAt?: any;
}
