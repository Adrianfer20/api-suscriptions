import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { Client } from '../models/client.model';

class ClientService {
  private collection() {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    return firebaseAdmin.firestore().collection('clients');
  }

  private conversationsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('conversations');
  }

  async create(data: Pick<Client, 'uid' | 'name' | 'phone' | 'address'>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    
    // Ensure UID exists in Auth
    try {
      await firebaseAdmin.auth().getUser(data.uid);
    } catch (e) {
      if (!data.uid.startsWith('whatsapp:')) {
         console.warn(`Creating client with possibly invalid Auth UID: ${data.uid}`, e);
      }
    }

    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    // 1. Check if a client with this phone already exists
    if (data.phone) {
        const existingSnap = await this.collection()
            .where('phone', '==', data.phone)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            const existingDoc = existingSnap.docs[0];
            console.warn(`Client with phone ${data.phone} already exists (ID: ${existingDoc.id}). Updating UID linkage.`);
            
            // Link existing client to new UID
            await existingDoc.ref.update({
                uid: data.uid,
                name: data.name,
                updatedAt: now
            });
            
            // Also update any existing conversation
            try {
                await this.conversationsCollection().doc(data.phone).set({
                    clientId: existingDoc.id,
                    name: data.name,
                    phone: data.phone,
                    prospect: false,
                    updatedAt: now
                }, { merge: true });
            } catch (err) {
                console.warn('Failed to link conversation to existing client', err);
            }

            const updatedSnap = await existingDoc.ref.get();
            return { id: existingDoc.id, ...(updatedSnap.data() as any) } as Client;
        }
    }

    // 2. Create new client
    const docRef = await this.collection().add({
      uid: data.uid,
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      roles: ['client'],
      createdAt: now,
      updatedAt: now
    });

    // 3. Link any existing conversation (from "Unknown" times) to this new client
    if (data.phone) {
        try {
            // Check if conversation exists (by phone ID) and update it
            // We use set with merge: true which works even if it doesn't exist (though it shouldn't be created here if not exist? 
            // actually if it doesn't exist, we don't necessarily need to create a conversation doc yet until a message is sent.
            // BUT if we want to ensure future messages link correctly, having the doc is fine. 
            // However, usually we only care if there is history.
            // Let's just update if it exists or create simple one.
            await this.conversationsCollection().doc(data.phone).set({
                clientId: docRef.id,
                name: data.name,
                phone: data.phone,
                prospect: false
            }, { merge: true });
        } catch (err) {
            console.warn('Failed to link conversation to new client', err);
        }
    }

    const snap = await docRef.get();
    return { id: docRef.id, ...(snap.data() as any) } as Client;
  }

  async list(limit?: number, startAfterId?: string) {
    let query: any = this.collection().orderBy('createdAt', 'desc');
    const lim = limit && Number.isInteger(limit) && limit > 0 ? limit : 100;
    if (startAfterId) {
      const cursorDoc = await this.collection().doc(startAfterId).get();
      if (!cursorDoc.exists) {
        throw new Error('Invalid cursor');
      }
      query = query.startAfter(cursorDoc);
    }
    query = query.limit(lim);
    const snaps = await query.get();
    return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Client));
  }

  async getById(id: string) {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as any) } as Client;
  }

  async update(id: string, patch: Partial<Client>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const data = { ...patch, updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() } as any;
    await this.collection().doc(id).update(data);
    const doc = await this.collection().doc(id).get();
    return { id: doc.id, ...(doc.data() as any) } as Client;
  }

  async deleteByUid(uid: string) {
      if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
      const snap = await this.collection().where('uid', '==', uid).get();
      if (snap.empty) return null;
      
      const batch = firebaseAdmin.firestore().batch();
      const clientIds: string[] = [];
      
      snap.docs.forEach(doc => {
          clientIds.push(doc.id);
          batch.delete(doc.ref);
      });
      
      await batch.commit();
      return clientIds;
  }
}

const clientService = new ClientService();
export default clientService;
