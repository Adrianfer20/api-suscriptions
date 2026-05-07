import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { Admin } from '../models/admin.model';

class AdminService {
  private collection() {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    return firebaseAdmin.firestore().collection('admins');
  }

  async create(data: Pick<Admin, 'uid' | 'name' | 'phone' | 'address' | 'email' | 'notes'>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');

    try {
      await firebaseAdmin.auth().getUser(data.uid);
    } catch (e) {
      console.warn(`Creating admin with possibly invalid Auth UID: ${data.uid}`, e);
    }

    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    if (data.phone) {
      const existingSnap = await this.collection()
        .where('phone', '==', data.phone)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        console.warn(`Admin with phone ${data.phone} already exists (ID: ${existingDoc.id}). Updating UID linkage.`);

        await existingDoc.ref.update({
          uid: data.uid,
          name: data.name,
          email: data.email || null,
          updatedAt: now
        });

        const updatedSnap = await existingDoc.ref.get();
        return { id: existingDoc.id, ...(updatedSnap.data() as any) } as Admin;
      }
    }

    const docRef = await this.collection().add({
      uid: data.uid,
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      email: data.email || null,
      roles: ['admin'],
      active: true,
      notes: data.notes || null,
      subscriptionIds: [],
      createdAt: now,
      updatedAt: now
    });

    const snap = await docRef.get();
    return { id: docRef.id, ...(snap.data() as any) } as Admin;
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
    return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Admin));
  }

  async getById(id: string) {
    const doc = await this.collection().doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...(doc.data() as any) } as Admin;
    }

    const snap = await this.collection().where('uid', '==', id).limit(1).get();
    if (!snap.empty) {
      const foundDoc = snap.docs[0];
      return { id: foundDoc.id, ...(foundDoc.data() as any) } as Admin;
    }
    return null;
  }

  async getByUid(uid: string) {
    const snap = await this.collection().where('uid', '==', uid).limit(1).get();
    if (!snap.empty) {
      const foundDoc = snap.docs[0];
      return { id: foundDoc.id, ...(foundDoc.data() as any) } as Admin;
    }
    return null;
  }

  async update(id: string, patch: Partial<Admin>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const data = { ...patch, updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() } as any;
    await this.collection().doc(id).update(data);

    const doc = await this.collection().doc(id).get();
    const updatedAdmin = { id: doc.id, ...(doc.data() as any) } as Admin;

    if (patch.name && updatedAdmin.uid) {
      try {
        await firebaseAdmin.auth().updateUser(updatedAdmin.uid, { displayName: patch.name });
      } catch (err) {
        console.warn('No se pudo actualizar displayName en Auth:', err);
      }
    }
    return updatedAdmin;
  }

  async deleteByUid(uid: string) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const snap = await this.collection().where('uid', '==', uid).get();
    if (snap.empty) return null;

    const batch = firebaseAdmin.firestore().batch();
    const adminIds: string[] = [];

    snap.docs.forEach(doc => {
      adminIds.push(doc.id);
      batch.delete(doc.ref);
    });

    await batch.commit();
    return adminIds;
  }
}

const adminService = new AdminService();
export default adminService;
