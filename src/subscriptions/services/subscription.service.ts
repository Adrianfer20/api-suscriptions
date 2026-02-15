import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { Subscription } from '../models/subscription.model';
import { addMonthsTZ, startOfDayTZ } from '../utils/date.util';

class SubscriptionService {
  private collection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('subscriptions');
  }

  private clientsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('clients');
  }

  async create(data: Pick<Subscription, 'clientId' | 'startDate' | 'cutDate' | 'plan' | 'amount'>) {
    // validate client exists (by doc id or uid)
    const byId = await this.clientsCollection().doc(data.clientId).get();
    let clientExists = byId.exists;
    if (!clientExists) {
      const q = await this.clientsCollection().where('uid', '==', data.clientId).limit(1).get();
      clientExists = !q.empty;
    }
    if (!clientExists) throw new Error('Client not found');

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
    // Default status is always active per business rule: service is already active when subscription is created
    const status = 'active';

    const docRef = await this.collection().add({
      clientId: data.clientId,
      startDate: data.startDate,
      cutDate: data.cutDate,
      plan: data.plan,
      amount: data.amount,
      status,
      createdAt: now,
      updatedAt: now
    });
    const snap = await docRef.get();
    return { id: docRef.id, ...(snap.data() as any) } as Subscription;
  }

  async list(limit?: number, startAfterId?: string) {
    let query: any = this.collection().orderBy('createdAt', 'desc');
    if (startAfterId) {
      const cursorDoc = await this.collection().doc(startAfterId).get();
      if (!cursorDoc.exists) {
        throw new Error('Invalid cursor');
      }
      query = query.startAfter(cursorDoc);
    }
    if (limit && Number.isInteger(limit) && limit > 0) query = query.limit(limit);
    const snaps = await query.get();
    return snaps.docs.map((d: firestore.QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) } as Subscription));
  }

  async getById(id: string) {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as any) } as Subscription;
  }

  async update(id: string, patch: Partial<Subscription>) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const data: any = { ...patch, updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() };
    await this.collection().doc(id).update(data);
    const doc = await this.collection().doc(id).get();
    return { id: doc.id, ...(doc.data() as any) } as Subscription;
  }

  async delete(id: string) {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    await this.collection().doc(id).delete();
    return true;
  }

  async renew(id: string) {
    const docRef = this.collection().doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error('Subscription not found');
    const current = doc.data() as any;
    const baseCut = current.cutDate ? String(current.cutDate) : startOfDayTZ(new Date());
    const nextCutIso = addMonthsTZ(baseCut, 1);

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    await docRef.update({
      cutDate: nextCutIso,
      status: 'active',
      updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    const updated = await docRef.get();
    return { id: updated.id, ...(updated.data() as any) } as Subscription;
  }
}

const subscriptionService = new SubscriptionService();
export default subscriptionService;
