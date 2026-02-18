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
        // Actualizar conversación existente (si hay)
        await this.conversationsCollection().doc(data.phone).set({
          clientId: docRef.id,
          name: data.name,
          phone: data.phone,
          prospect: false
        }, { merge: true });

        // Migrar mensajes históricos de ese número para asignar el nuevo clientId
        // (solo si existe la colección de mensajes)
        const commsService = require('../../communications/services/communications.service').default;
        if (commsService && commsService.migrateMessagesToClient) {
          await commsService.migrateMessagesToClient(data.phone, docRef.id);
        }
      } catch (err) {
        console.warn('Failed to link conversation to new client or migrate messages', err);
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
      const phones: string[] = [];
      
      snap.docs.forEach(doc => {
          clientIds.push(doc.id);
          if (doc.data().phone) phones.push(doc.data().phone);
          batch.delete(doc.ref);
      });
      
      await batch.commit();

      // Actualizar conversación a prospecto si existe
      for (const phone of phones) {
        try {
          await this.conversationsCollection().doc(phone).set({
            clientId: firebaseAdmin.firestore.FieldValue.delete(),
            prospect: true,
            name: 'Desconocido',
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.warn('Failed to update conversation to prospect after client delete', err);
        }
      }
      return clientIds;
  }
}

const clientService = new ClientService();
export default clientService;
