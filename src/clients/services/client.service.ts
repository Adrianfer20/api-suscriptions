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
    try {
      await firebaseAdmin.auth().getUser(data.uid);
    } catch (e) {
      // In some cases (like manual creation without auth user yet) we might want to skip this check or handle differently.
      // For now, consistent with previous behavior, we check if UID is valid unless it is a placeholder.
      if (!data.uid.startsWith('whatsapp:')) {
         console.warn(`Creating client with possibly invalid Auth UID: ${data.uid}`, e);
      }
    }

    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    // 1. Check if a prospect with this phone already exists
    if (data.phone) {
        const existingSnap = await this.collection()
            .where('phone', '==', data.phone)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data();
            
            // If the existing client is a "prospect" (created automatically with a placeholder UID or role 'lead')
            // We should "promote" it to a real client by updating the UID and data.
            // Check if it looks like a prospect:
            const isProspect = existingData.uid?.startsWith('whatsapp:') || (existingData.roles && existingData.roles.includes('lead'));

            if (isProspect) {
                // Merge new data but preserve conversation history
                await existingDoc.ref.update({
                    uid: data.uid, // Update to real Auth UID
                    name: data.name, // Update to real Name
                    address: data.address || existingData.address || null, // Update address if provided
                    roles: firebaseAdmin.firestore.FieldValue.arrayRemove('lead'), // Remove 'lead' role optionally? Or just add 'client'?
                    // For simplicity, let's reset roles or add 'client' if you have a role system.
                    // Assuming we just update basic info for now. 
                    updatedAt: now
                });
                
                // Add 'client' role if needed, separate operation to avoid conflicts if 'lead' didn't exist
                await existingDoc.ref.update({
                    roles: firebaseAdmin.firestore.FieldValue.arrayUnion('client')
                });

                const updatedSnap = await existingDoc.ref.get();
                return { id: existingDoc.id, ...(updatedSnap.data() as any) } as Client;
            } else {
                // If a client with this phone ALREADY exists and is NOT a prospect (has a real UID different from the new one),
                // we have a conflict. A phone number should be unique ? 
                // Alternatively, we can just throw an error or create a duplicate (which is bad).
                // Let's assume we want to update the existing client to link to this new UID? 
                // OR throw error. For safety, let's just log warning and proceed to create NEW one (legacy behavior) 
                // OR better, update the existing one to the new UID?
                console.warn(`Client with phone ${data.phone} already exists (ID: ${existingDoc.id}). Updating UID linkage.`);
                
                // OPTION: Update the existing client to point to the new UID provided
                await existingDoc.ref.update({
                    uid: data.uid,
                    updatedAt: now
                });
                const updatedSnap = await existingDoc.ref.get();
                return { id: existingDoc.id, ...(updatedSnap.data() as any) } as Client;
            }
        }
    }

    // 2. No existing client found, create new one
    const docRef = await this.collection().add({
      uid: data.uid,
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      roles: ['client'],
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
