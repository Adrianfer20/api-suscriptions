export interface Conversation {
  id?: string; // We can use the phone number as the ID for easy lookup
  clientId?: string; // Optional: linked client ID if they exist
  name?: string; // Display name (Client name or WhatsApp profile name)
  phone: string; // The phone number (E.164)
  lastMessageAt?: any;
  lastMessageBody?: string;
  lastMessageDir?: 'inbound' | 'outbound';
  unreadCount: number;
  prospect: boolean; // True if not a registered client, false if registered
}
