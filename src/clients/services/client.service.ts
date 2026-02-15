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

  async create(data: Pick<Client, 'uid' | 'name' | 'phone' | 'address'>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    // Ensure UID exists in Auth
    await firebaseAdmin.auth().getUser(data.uid);
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
    const docRef = await this.collection().add({
      uid: data.uid,
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      createdAt: now,
      updatedAt: now
    });
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
}

const clientService = new ClientService();
export default clientService;
