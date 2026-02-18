export interface Client {
  id?: string;
  uid: string; // Firebase UID
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  roles?: string[];
  active?: boolean;
  notes?: string;
  // Conversation metadata
  lastMessageAt?: any;
  lastMessageBody?: string;
  lastMessageDir?: 'inbound' | 'outbound';
  unreadCount?: number;
  // timestamps stored by Firestore
  createdAt?: any;
  updatedAt?: any;
}
