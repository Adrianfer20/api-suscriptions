export interface Client {
  id?: string;
  uid: string; // Firebase UID
  name: string;
  phone?: string;
  address?: string;
  // timestamps stored by Firestore
  createdAt?: any;
  updatedAt?: any;
}
