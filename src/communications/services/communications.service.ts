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

    // Update client conversation metadata
    await this.clientsCollection().doc(resolvedClientId).update({
        lastMessageAt: now,
        lastMessageBody: `Template: ${templateName}`,
        lastMessageDir: 'outbound'
    });

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

    await this.clientsCollection().doc(resolvedClientId).update({
        lastMessageAt: now,
        lastMessageBody: body,
        lastMessageDir: 'outbound'
    });

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

    // Find client
    let clientId = 'unknown';
    let clientName = ProfileName || 'Unknown';
    
    // Try to find client by 'phone'
    const qSnapshot = await this.clientsCollection().where('phone', '==', fromPhone).limit(1).get();
    if (!qSnapshot.empty) {
      const clientDoc = qSnapshot.docs[0];
      clientId = clientDoc.id;
      const clientData = clientDoc.data();
      clientName = clientData.name || clientName;
    }

    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    const incomingMsg: Partial<Message> = {
      clientId,
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
    
    // If client is known, update conversation metadata
    if (clientId !== 'unknown') {
        const clientRef = this.clientsCollection().doc(clientId);
        try {
          await clientRef.update({
              lastMessageAt: now,
              lastMessageBody: Body || '(Media/No text)',
              lastMessageDir: 'inbound',
              unreadCount: firebaseAdmin.firestore.FieldValue.increment(1)
          });
        } catch (e) {
          console.warn(`Failed to update client ${clientId} for inbound message.`, e);
        }
    }

    return { id: docRef.id, ...incomingMsg };
  }

  async getConversations(limitVal: number = 20, startAfterId?: string) {
    let query = this.clientsCollection().orderBy('lastMessageAt', 'desc');
    
    if (startAfterId) {
       const cursorDoc = await this.clientsCollection().doc(startAfterId).get();
       if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
       }
    }
    
    query = query.limit(limitVal);
    const snaps = await query.get();
    
    // Filter out clients without conversations if needed, but query orderBy lastMessageAt implies they have one (if field exists).
    // However, if we want ALL clients, we might see some without msgs at the end.
    // Assuming we only want active conversations:
    return snaps.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
    })).filter(c => c.lastMessageAt);
  }

  async markAsRead(clientIdOrUid: string) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    
    // Resolve client
    let docId = clientIdOrUid;
    let clientDoc = await this.clientsCollection().doc(clientIdOrUid).get();
    
    if (!clientDoc.exists) {
       const q = await this.clientsCollection().where('uid', '==', clientIdOrUid).limit(1).get();
       if (!q.empty) {
         clientDoc = q.docs[0];
       }
    }
    
    if (!clientDoc.exists) {
       // Silent fail or throw? Throw is better for API response
       throw new Error('Client not found');
    }
    
    docId = clientDoc.id;

    // 1. Reset client unread count
    await this.clientsCollection().doc(docId).update({ unreadCount: 0 });

    // 2. Mark specific messages as read (limit 500 per batch)
    // Query inbound 'received' messages for this client
    const unreadSnap = await this.messagesCollection()
      .where('clientId', '==', docId)
      .where('direction', '==', 'inbound')
      .where('status', '==', 'received')
      .limit(500) 
      .get();
      
    if (!unreadSnap.empty) {
        const batch = firebaseAdmin.firestore().batch();
        unreadSnap.docs.forEach((doc: firestore.QueryDocumentSnapshot) => {
            batch.update(doc.ref, { status: 'read' });
        });
        await batch.commit();
    }

    return { ok: true, clientId: docId };
  }
}

const communicationsService = new CommunicationsService();
export default communicationsService;
