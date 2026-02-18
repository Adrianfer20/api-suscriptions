import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import twilioClient from '../../config/twilio';
import { TWILIO_CONFIG } from '../../config/index';
import templates, { getMissingTemplateVariables, renderContentVariables } from '../templates';
import { Message } from '../models/message.model';
import type { Subscription } from '../../subscriptions/models/subscription.model';

class CommunicationsService {
  private messagesCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    // store messages under /communications/messages/entries
    return firebaseAdmin.firestore().collection('communications').doc('messages').collection('entries');
  }

  private conversationsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('conversations');
  }

  private clientsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('clients');
  }

  private subscriptionsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('subscriptions');
  }

  private async findLatestSubscription(clientId: string): Promise<Subscription | null> {
    try {
      const snap = await this.subscriptionsCollection().where('clientId', '==', clientId).orderBy('updatedAt', 'desc').limit(1).get();
      if (!snap.empty) return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } as Subscription;
    } catch {
      const snap = await this.subscriptionsCollection().where('clientId', '==', clientId).limit(1).get();
      if (!snap.empty) return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } as Subscription;
    }
    return null;
  }

  private async resolveTemplateData(templateName: string, clientId: string, clientUid?: string, clientDocId?: string) {
    const candidates = Array.from(
      new Set([clientId, clientUid, clientDocId])
    ).filter((value): value is string => typeof value === 'string' && value.trim() !== '');

    let subscription: Subscription | null = null;
    for (const id of candidates) {
      subscription = await this.findLatestSubscription(id);
      if (subscription) break;
    }
    if (!subscription) return {} as Record<string, unknown>;

    switch (templateName) {
      case 'subscription_cutoff_day_2v':
        return {
          subscriptionLabel: subscription.plan || '',
          cutoffDate: subscription.cutDate || ''
        };
      case 'subscription_reminder_3days_2v':
        return {
          dueDate: subscription.cutDate || ''
        };
      case 'subscription_suspended_notice_2v':
        return {
          subscriptionLabel: subscription.plan || ''
        };
      default:
        return {} as Record<string, unknown>;
    }
  }

  async sendTemplate(clientId: string, templateName: string, templateData?: any) {
    // resolve client phone (by doc id or by uid)
    let clientDoc = await this.clientsCollection().doc(clientId).get();
    if (!clientDoc.exists) {
      const q = await this.clientsCollection().where('uid', '==', clientId).limit(1).get();
      if (!q.empty) clientDoc = q.docs[0];
    }
    if (!clientDoc || !clientDoc.exists) throw new Error('Client not found');
    const resolvedClientId = clientDoc.id;
    const client = clientDoc.data() as any;
    const toPhone = client.phone;
    if (!toPhone) throw new Error('Client has no phone number');

    const contentSid = templates[templateName]?.contentSid;
    if (!contentSid) throw new Error('Template not found');
    const inferredTemplateData = await this.resolveTemplateData(templateName, clientId, client.uid, clientDoc.id);
    const mergedTemplateData = { ...inferredTemplateData, ...templateData, name: client.name };
    const missingVars = getMissingTemplateVariables(templateName, mergedTemplateData);
    if (missingVars.length > 0) {
      throw new Error(`Missing template variables: ${missingVars.join(', ')}`);
    }
    const contentVariables = renderContentVariables(templateName, mergedTemplateData);

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    const base: Partial<Message> = {
      clientId: resolvedClientId,
      template: templateName,
      body: '',
      to: toPhone,
      direction: 'outbound',
      status: 'queued',
      createdAt: now,
      updatedAt: now
    };

    // persist initial record
    const docRef = await this.messagesCollection().add(base);

    // Update conversation metadata
    // We use phone number as the document ID for conversations
    await this.conversationsCollection().doc(toPhone).set({
        clientId: resolvedClientId,
        name: client.name,
        phone: toPhone,
        lastMessageAt: now,
        lastMessageBody: `Template: ${templateName}`,
        lastMessageDir: 'outbound',
        prospect: false,
        unreadCount: 0 // Resetting or keeping? For outbound, it doesn't change unread count usually, or sets it to 0 if we consider we replied.
    }, { merge: true });

    // attempt to send via Twilio (WhatsApp)
    try {
      // Dry-run mode for safe local testing
      if (process.env.TEST_DRY_RUN === 'true') {
        await this.messagesCollection().doc(docRef.id).update({
          status: 'sent',
          twilioSid: 'dry-run-sid',
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        const snap = await docRef.get();
        return { id: docRef.id, ...(snap.data() as any) } as Message;
      }

      if (!twilioClient) throw new Error('Twilio client not configured');
      const from = TWILIO_CONFIG.from || '';
      const msg = await twilioClient.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${toPhone}`,
        contentSid,
        contentVariables: JSON.stringify(contentVariables)
      });

      await this.messagesCollection().doc(docRef.id).update({
        status: 'sent',
        twilioSid: msg.sid,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      });
      const snap = await docRef.get();
      return { id: docRef.id, ...(snap.data() as any) } as Message;
    } catch (err: any) {
      await this.messagesCollection().doc(docRef.id).update({
        status: 'failed',
        error: String(err?.message || err),
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      });
      const snap = await docRef.get();
      return { id: docRef.id, ...(snap.data() as any) } as Message;
    }
  }

  async sendText(clientId: string, body: string) {
    let clientDoc = await this.clientsCollection().doc(clientId).get();
    if (!clientDoc.exists) {
      const q = await this.clientsCollection().where('uid', '==', clientId).limit(1).get();
      if (!q.empty) clientDoc = q.docs[0];
    }
    if (!clientDoc || !clientDoc.exists) throw new Error('Client not found');
    const resolvedClientId = clientDoc.id;
    const client = clientDoc.data() as any;
    const toPhone = client.phone;
    if (!toPhone) throw new Error('Client has no phone number');

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    const base: Partial<Message> = {
      clientId: resolvedClientId,
      body,
      to: toPhone,
      direction: 'outbound',
      status: 'queued',
      createdAt: now,
      updatedAt: now
    };

    const docRef = await this.messagesCollection().add(base);

    // Update conversation metadata
    await this.conversationsCollection().doc(toPhone).set({
        clientId: resolvedClientId,
        name: client.name,
        phone: toPhone,
        lastMessageAt: now,
        lastMessageBody: body,
        lastMessageDir: 'outbound',
        prospect: false,
        unreadCount: 0
    }, { merge: true });

    try {
      if (process.env.TEST_DRY_RUN === 'true') {
        await this.messagesCollection().doc(docRef.id).update({
          status: 'sent',
          twilioSid: 'dry-run-sid',
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        const snap = await docRef.get();
        return { id: docRef.id, ...(snap.data() as any) } as Message;
      }

      if (!twilioClient) throw new Error('Twilio client not configured');
      const from = TWILIO_CONFIG.from || '';
      const msg = await twilioClient.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${toPhone}`,
        body
      });

      await this.messagesCollection().doc(docRef.id).update({
        status: 'sent',
        twilioSid: msg.sid,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      });
      const snap = await docRef.get();
      return { id: docRef.id, ...(snap.data() as any) } as Message;
    } catch (err: any) {
      await this.messagesCollection().doc(docRef.id).update({
        status: 'failed',
        error: String(err?.message || err),
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      });
      const snap = await docRef.get();
      return { id: docRef.id, ...(snap.data() as any) } as Message;
    }
  }

  async getMessagesByClient(clientIdOrUid: string, limit?: number, startAfterId?: string) {
    // Resolve client to get both Doc ID and UID
    let docId = clientIdOrUid;
    let uid = clientIdOrUid;
    
    // Check if it's a doc ID
    let clientDoc = await this.clientsCollection().doc(clientIdOrUid).get();
    
    // If not found, check if it is a UID
    if (!clientDoc.exists) {
       const q = await this.clientsCollection().where('uid', '==', clientIdOrUid).limit(1).get();
       if (!q.empty) {
         clientDoc = q.docs[0];
       }
    }

    if (clientDoc.exists) {
       docId = clientDoc.id;
       const data = clientDoc.data() as any;
       uid = data.uid || 'unknown';
    }

    // Query for messages matching either Doc ID or UID to support legacy data
    const candidates = Array.from(new Set([docId, uid])).filter(x => x !== 'unknown');
    
    // NOTE: 'in' query supports up to 10 values.
    // We also need composite index on 'clientId' + 'createdAt'
    // BUT 'in' queries with orderBy might require specific index configuration or client-side merging.
    // Firestore 'in' matches ANY of the values. 
    // However, if we simply use 'where clientId == resolvedDocId', we fix the main issue (inbound messages).
    // If we want to support legacy outbound messages (stored with UID), 'in' is better.
    
    let query: any = this.messagesCollection()
      .where('clientId', 'in', candidates)
      .orderBy('createdAt', 'desc');

    if (startAfterId) {
      const cursorDoc = await this.messagesCollection().doc(startAfterId).get();
      if (!cursorDoc.exists) {
        throw new Error('Invalid cursor');
      }
      query = query.startAfter(cursorDoc);
    }
    if (limit && Number.isInteger(limit) && limit > 0) query = query.limit(limit);
    
    try {
      const snaps = await query.get();
      return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Message));
    } catch (e: any) {
        // Fallback: if 'in' query fails (index missing), try querying by Doc ID only (the correct way forward)
        // This handles cases where index isn't updated for 'in' operator immediately.
        console.warn('Composite query failed, falling back to Doc ID only', e);
        const fallbackQuery = this.messagesCollection()
             .where('clientId', '==', docId)
             .orderBy('createdAt', 'desc')
             .limit(limit || 20);
        const snaps = await fallbackQuery.get();
        return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Message));
    }
  }

  async receive(payload: any) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    
    // Twilio payload fields (incoming WhatsApp msg)
    const { From, To, Body, MessageSid, ProfileName } = payload;
    
    const fromPhone = (From || '').replace('whatsapp:', '');
    if (!fromPhone) throw new Error('Invalid sender');

    let clientName = ProfileName || 'Unknown';
    let clientId = 'unknown';

    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    // 1. Try to find client by 'phone'
    const qSnapshot = await this.clientsCollection().where('phone', '==', fromPhone).limit(1).get();
    
    if (!qSnapshot.empty) {
      const clientDoc = qSnapshot.docs[0];
      clientId = clientDoc.id;
      const clientData = clientDoc.data();
      clientName = clientData.name || clientName;
    } 
    // We no longer create a "prospect" client here. We just handle the conversation.

    const incomingMsg: Partial<Message> = {
      clientId, // might be 'unknown'
      body: Body || '', 
      from: fromPhone,
      to: (To || '').replace('whatsapp:', ''),
      direction: 'inbound',
      status: 'received',
      twilioSid: MessageSid,
      createdAt: now,
      updatedAt: now
    };

    const docRef = await this.messagesCollection().add(incomingMsg);
    
    // Update or Create Conversation Document
    // ID is the phone number
    const conversationRef = this.conversationsCollection().doc(fromPhone);
    
    const conversationData: any = {
        phone: fromPhone,
        lastMessageAt: now,
        lastMessageBody: Body || '(Media/No text)',
        lastMessageDir: 'inbound',
        unreadCount: firebaseAdmin.firestore.FieldValue.increment(1),
        prospect: clientId === 'unknown'
    };
    
    if (clientId !== 'unknown') {
        conversationData.clientId = clientId;
        conversationData.name = clientName; 
    } else {
        // Only set name if it doesn't exist or update it? 
        // We can create it if not exists.
        // If it exists, we might want to keep the name user set? 
        // For simplicity, let's use merge: true and only set name if we have a profile name or it's new
        if (ProfileName) conversationData.name = ProfileName;
    }

    // Use set with merge to create or update
    await conversationRef.set(conversationData, { merge: true });

    return { id: docRef.id, ...incomingMsg };
  }

  async getConversations(limitVal: number = 20, startAfterId?: string) {
    let query = this.conversationsCollection().orderBy('lastMessageAt', 'desc');
    
    if (startAfterId) {
       const cursorDoc = await this.conversationsCollection().doc(startAfterId).get();
       if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
       }
    }
    
    query = query.limit(limitVal);
    const snaps = await query.get();
    
    return snaps.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
    }));
  }

  async markAsRead(clientIdOrPhone: string) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    
    let docId = clientIdOrPhone;
    let phone = clientIdOrPhone;
    
    // 1. Try to fetch conversation by Phone (if param is phone)
    let convDoc = await this.conversationsCollection().doc(clientIdOrPhone).get();
    
    if (!convDoc.exists) {
        // 2. Try to fetch by clientId
        // The param might be clientId
        const q = await this.conversationsCollection().where('clientId', '==', clientIdOrPhone).limit(1).get();
        if (!q.empty) {
            convDoc = q.docs[0];
            phone = convDoc.id; // phone is the ID
        } else {
             // Maybe clientIdOrPhone IS the client Doc ID in 'clients' collection, let's verify
             const clientDoc = await this.clientsCollection().doc(clientIdOrPhone).get();
             if (clientDoc.exists) {
                 const clientData = clientDoc.data();
                 if (clientData && clientData.phone) {
                     phone = clientData.phone;
                     convDoc = await this.conversationsCollection().doc(phone).get();
                 }
             }
        }
    } else {
        // Document exists, so param was likely the phone number
        phone = convDoc.id;
    }

    if (!convDoc || !convDoc.exists) {
        // Conversation not found, maybe just client exists?
        // If client exists but no conversation, nothing to mark as read really.
       throw new Error('Conversation not found');
    }

    // 1. Reset conversation unread count
    await this.conversationsCollection().doc(phone).update({ unreadCount: 0 });

    // 2. Mark specific messages as read (limit 500 per batch)
    // Query inbound 'received' messages for this phone (using 'from') or clientId?
    // Messages store 'clientId' or 'from'. 
    // If the message has clientId, we can query by that. If 'unknown', query by 'from'.
    
    let unreadQuery = this.messagesCollection()
      .where('direction', '==', 'inbound')
      .where('status', '==', 'received')
      .limit(500);

    const convData = convDoc.data();
    if (convData && convData.clientId) {
        unreadQuery = unreadQuery.where('clientId', '==', convData.clientId);
    } else {
        unreadQuery = unreadQuery.where('from', '==', phone);
    }

    const unreadSnap = await unreadQuery.get();
      
    if (!unreadSnap.empty) {
        const batch = firebaseAdmin.firestore().batch();
        unreadSnap.docs.forEach((doc: firestore.QueryDocumentSnapshot) => {
            batch.update(doc.ref, { status: 'read' });
        });
        await batch.commit();
    }

    return { ok: true, phone };
  }
}

const communicationsService = new CommunicationsService();
export default communicationsService;
