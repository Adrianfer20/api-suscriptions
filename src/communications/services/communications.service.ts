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

  async sendTemplate(clientIdOrPhone: string, templateName: string, templateData?: any) {
    // 1. Resolve Recipient
    let resolvedClientId = 'unknown';
    let toPhone = '';
    let clientName = '';
    let client: any = {};
    let clientDocId = '';

    // A. Try as Client ID (Doc ID or UID)
    let clientDoc = await this.clientsCollection().doc(clientIdOrPhone).get();
    if (!clientDoc.exists) {
      const q = await this.clientsCollection().where('uid', '==', clientIdOrPhone).limit(1).get();
      if (!q.empty) clientDoc = q.docs[0];
    }

    if (clientDoc.exists) {
        resolvedClientId = clientDoc.id;
        clientDocId = clientDoc.id;
        client = clientDoc.data();
        toPhone = client.phone;
        clientName = client.name;
    } else {
        // B. Try as Phone Number
        // Remove spaces/dashes just in case, but usually passed clean
        const potentialPhone = clientIdOrPhone.replace(/[\s()-]/g, '');
        if (/^\+?[0-9]{7,15}$/.test(potentialPhone)) {
             toPhone = potentialPhone;
             // Check if this phone belongs to a client we missed?
             const qPhone = await this.clientsCollection().where('phone', '==', toPhone).limit(1).get();
             if (!qPhone.empty) {
                 clientDoc = qPhone.docs[0];
                 resolvedClientId = clientDoc.id;
                 clientDocId = clientDoc.id;
                 client = clientDoc.data();
                 clientName = client.name;
                 // It was a valid client phone, proceeding as registered client
             } else {
                 // It is truly unknown/prospect
                 clientName = 'Desconocido';
             }
        }
    }

    if (!toPhone) throw new Error('Recipient not found or has no phone number');

    const contentSid = templates[templateName]?.contentSid;
    if (!contentSid) throw new Error('Template not found');
    
    // Resolve data (might return empty if no client found)
    const inferredTemplateData = await this.resolveTemplateData(templateName, clientDocId, client.uid, clientDocId);
    
    // Merge data
    const mergedTemplateData = { 
        ...inferredTemplateData, 
        ...templateData, 
        name: clientName 
    };
    
    // Validate vars
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
        clientId: resolvedClientId !== 'unknown' ? resolvedClientId : undefined,
        name: clientName || `Desconocido ${toPhone}`,
        phone: toPhone,
        lastMessageAt: now,
        lastMessageBody: `Template: ${templateName}`,
        lastMessageDir: 'outbound',
        prospect: resolvedClientId === 'unknown',
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

  async sendText(clientIdOrPhone: string, body: string) {
    let resolvedClientId = 'unknown';
    let toPhone = '';
    let clientName = '';

    // A. Try as Client ID
    let clientDoc = await this.clientsCollection().doc(clientIdOrPhone).get();
    if (!clientDoc.exists) {
      const q = await this.clientsCollection().where('uid', '==', clientIdOrPhone).limit(1).get();
      if (!q.empty) clientDoc = q.docs[0];
    }
    
    if (clientDoc.exists) {
      resolvedClientId = clientDoc.id;
      const client = clientDoc.data() as any;
      toPhone = client.phone;
      clientName = client.name;
    } else {
        // B. Try as Phone Number
        const potentialPhone = clientIdOrPhone.replace(/[\s()-]/g, '');
        if (/^\+?[0-9]{7,15}$/.test(potentialPhone)) {
            toPhone = potentialPhone;
            // Maybe find client by phone?
            const qPhone = await this.clientsCollection().where('phone', '==', toPhone).limit(1).get();
            if (!qPhone.empty) {
                clientDoc = qPhone.docs[0];
                resolvedClientId = clientDoc.id;
                const data = clientDoc.data() as any;
                clientName = data.name;
            } else {
                clientName = `Desconocido ${toPhone}`;
            }
        }
    }

    if (!toPhone) throw new Error('Recipient not found or has no phone number');

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
        clientId: resolvedClientId !== 'unknown' ? resolvedClientId : undefined,
        name: clientName,
        phone: toPhone,
        lastMessageAt: now,
        lastMessageBody: body,
        lastMessageDir: 'outbound',
        prospect: resolvedClientId === 'unknown',
        unreadCount: 0 // Mark as read since we replied?
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

  async getMessagesByClient(identifier: string, limit?: number, startAfterId?: string) {
    // Determine if identifier is a phone number (simple check: starts with '+' or contains only digits and length > 7)
    const isPhone = /^\+?[0-9]{7,15}$/.test(identifier);
    
    let query: any;
    
    if (isPhone) {
        // If it's a phone, we need to find messages where (to == phone) OR (from == phone)
        // Firestore limitation: No logical OR across different fields directly in one query with orderBy easily.
        // However, we can query by 'clientId' if the phone belongs to a client, OR query by 'to/from'.
        // BUT, since we normalized conversations, we usually store 'clientId' as 'unknown' for prospects.
        // So prospects sort of depend on 'from'.
        
        // STRATEGY:
        // 1. Check if there is a known client with this phone. If so, get their ID and query by clientId (legacy + standard way).
        // 2. If no client, query by `from == phone` AND `to == phone`? No, inbound is 'from=phone', outbound is 'to=phone'.
        // Since we can't do OR on (from==X || to==X), we might need two queries and merge, OR rely on a unified field if we had one.
        // BETTER STRATEGY given current structure:
        // Messages are either Inbound (from=phone, to=Twilio) OR Outbound (from=Twilio, to=phone).
        // So we can query:
        // A) where('clientId', '==', resolvedClientId) -> Covers both directions for registered clients
        // B) where('from', '==', phone) + where('to', '==', phone) -> For prospects who have clientId='unknown'
        
        // Let's first try to resolve a client ID from the phone
        const clientSnap = await this.clientsCollection().where('phone', '==', identifier).limit(1).get();
        let resolvedClientId = 'unknown';
        if (!clientSnap.empty) {
            resolvedClientId = clientSnap.docs[0].id;
        }

        if (resolvedClientId !== 'unknown') {
             // It is a registered client, so all their messages SHOULD have clientId set.
             query = this.messagesCollection().where('clientId', '==', resolvedClientId).orderBy('createdAt', 'desc');
        } else {
             // It is a prospect (unknown client). Messages will have clientId='unknown' (or similar).
             // We need to fetch inbound (from=phone) and outbound (to=phone) where clientId IS unknown or irrelevant.
             // But we can't orderBy createdAt across two queries easily with pagination.
             // HACK/SOLUTION:
             // Since 'conversations' model uses phone as key, maybe we should start stamping 'conversationId' on messages?
             // Too late for existing data.
             
             // ALTERNATIVE: 
             // Just fetch by 'clientId' == 'unknown' AND 'from' == phone? 
             // But what about replies TO them? They will have to=phone.
             // We can't do (clientId=='unknown' AND (to==phone OR from==phone)).
             
             // COMPLEXITY REDUCTION:
             // For now, let's assume we can query by `from` == identifier. 
             // This gets all INBOUND messages from them.
             // What about OUTBOUND replies to prospects? 
             // They should have `to` == identifier.
             
             // Client-Side Merge Strategy for Prospects:
             // Since volume is likely low for prospects, we can run two queries (limit X) and merge/sort in memory.
             // BUT pagination is tricky. Easiest is to just fetch limit from both and merge top X.
             // HOWEVER, if we want strict pagination...
             
             // ACTUALLY, if we look at `receive` and `sendText`...
             // In `receive` we set `clientId`. If unknown, it is 'unknown'.
             // In `sendText`, if we modify it to allow sending to phones without client, we would set clientId='unknown' too.
             
             // If we really want to support this well, we should add a 'phone' or 'conversationId' field to ALL messages 
             // equal to the user's phone number (regardless of direction).
             // But for now, let's try the Client ID resolution first (covers 90% cases).
             // If not found, we fall back to a "Best Effort" query or Client Side Merge.
             
             // Let's implement the Merge for Unknown phones:
             // We will query where `from` == phone (Inbound)
             // AND `to` == phone (Outbound)
             // Then merge and sort.
             
             const limitVal = limit || 20;
             const q1 = this.messagesCollection().where('from', '==', identifier).orderBy('createdAt', 'desc').limit(limitVal);
             const q2 = this.messagesCollection().where('to', '==', identifier).orderBy('createdAt', 'desc').limit(limitVal);
             
             // This doesn't support startAfter properly across mixed streams easily without complex logic.
             // For simple usage, we just fetch mostly recent. 
             const [inbound, outbound] = await Promise.all([q1.get(), q2.get()]);
             
             const allDocs = [...inbound.docs, ...outbound.docs].map(d => ({ id: d.id, ...(d.data() as any) } as Message));
             // Sort by createdAt desc
             allDocs.sort((a, b) => {
                 const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                 const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                 return tB - tA;
             });
             
             return allDocs.slice(0, limitVal);
        }
    } else {
        // It is NOT a phone, so it must be a UUID/DocID (Behavior as before)
        // Resolve client to get both Doc ID and UID
        let docId = identifier;
        let uid = identifier;
        
        let clientDoc = await this.clientsCollection().doc(identifier).get();
        if (!clientDoc.exists) {
           const q = await this.clientsCollection().where('uid', '==', identifier).limit(1).get();
           if (!q.empty) {
             clientDoc = q.docs[0];
           }
        }
    
        if (clientDoc.exists) {
           docId = clientDoc.id;
           const data = clientDoc.data() as any;
           uid = data.uid || 'unknown';
        }
    
        const candidates = Array.from(new Set([docId, uid])).filter(x => x !== 'unknown');
        query = this.messagesCollection()
          .where('clientId', 'in', candidates)
          .orderBy('createdAt', 'desc');
    }

    if (startAfterId && query) {
      const cursorDoc = await this.messagesCollection().doc(startAfterId).get();
      if (!cursorDoc.exists) {
        throw new Error('Invalid cursor');
      }
      query = query.startAfter(cursorDoc);
    }
    if (limit && Number.isInteger(limit) && limit > 0 && query) query = query.limit(limit);
    
    try {
      if (!query) return []; // Should have been handled above (client side merge case returns directly)
      const snaps = await query.get();
      return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Message));
    } catch (e: any) {
        console.warn('Query failed', e);
        return [];
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
