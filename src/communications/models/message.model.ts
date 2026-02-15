export interface Message {
  id?: string;
  clientId: string;
  template?: string;
  body: string;
  to: string;
  from?: string; // e.g. the client's number for inbound
  direction: 'inbound' | 'outbound';
  status: 'queued' | 'sent' | 'failed' | 'delivered' | 'read' | 'received';
  twilioSid?: string;
  error?: any;
  createdAt?: any;
  updatedAt?: any;
}
