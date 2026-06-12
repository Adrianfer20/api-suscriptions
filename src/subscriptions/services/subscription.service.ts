import firebaseAdmin from '../../config/firebaseAdmin';
import type { firestore } from 'firebase-admin';
import { Subscription } from '../models/subscription.model';
import { addMonthsTZ, startOfDayTZ } from '../utils/date.util';
import communicationsService from '../../communications/services/communications.service';
import billingPeriodService from '../../billingPeriods/services/billingPeriod.service';

class SubscriptionService {
  private collection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('subscriptions');
  }

  private clientsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('clients');
  }

  private adminsCollection() {
    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    return firebaseAdmin.firestore().collection('admins');
  }

  private parseAmount(amount: string | number | undefined): number {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount.replace(/[^0-9.-]/g, ''));
      if (Number.isNaN(parsed)) throw new Error('Invalid amount');
      return parsed;
    }
    throw new Error('Amount is required');
  }

  async create(data: Pick<Subscription, 'clientId' | 'ownerId' | 'startDate' | 'cutDate' | 'nextCutDate' | 'plan' | 'amount' | 'passwordSub' | 'kitNumber' | 'country' | 'cycleDay'>) {
    const lookupId = data.ownerId || data.clientId;
    if (!lookupId) throw new Error('Client or Admin not found');

    let clientDoc = await this.clientsCollection().doc(lookupId).get();
    let clientExists = clientDoc.exists;
    let clientPhone = '';
    let userType: 'client' | 'admin' = 'client';

    if (!clientExists) {
      const q = await this.clientsCollection().where('uid', '==', lookupId).limit(1).get();
      if (!q.empty) {
        clientDoc = q.docs[0];
        clientExists = true;
      }
    }

    if (!clientExists) {
      let adminDoc = await this.adminsCollection().doc(lookupId).get();
      let adminExists = adminDoc.exists;
      
      if (!adminExists) {
        const qAdmin = await this.adminsCollection().where('uid', '==', lookupId).limit(1).get();
        if (!qAdmin.empty) {
          adminDoc = qAdmin.docs[0];
          adminExists = true;
        }
      }

      if (adminExists) {
        clientDoc = adminDoc;
        clientExists = true;
        userType = 'admin';
      }
    }

    if (!clientExists) throw new Error('Client or Admin not found');

    const userData = clientDoc.data();
    clientPhone = userData?.phone || '';

    if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
    const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
    const status = 'active';

    const nextCutDate = data.nextCutDate || data.cutDate || data.startDate;
    if (!nextCutDate) throw new Error('nextCutDate, cutDate or startDate is required');

    const docRef = await this.collection().add({
      ownerId: data.ownerId || data.clientId,
      clientId: data.clientId || null,
      startDate: data.startDate || null,
      plan: data.plan,
      amount: this.parseAmount(data.amount),
      cycleDay: data.cycleDay || null,
      cutDate: nextCutDate,
      nextCutDate,
      passwordSub: data.passwordSub || null,
      kitNumber: (data as any).kitNumber || 'Valor No Disponible',
      status,
      country: data.country || null,
      createdAt: now,
      updatedAt: now
    });
    const snap = await docRef.get();
    const newSubscription = { id: docRef.id, ...(snap.data() as any) } as Subscription;

    if (data.amount !== undefined) {
      try {
        await billingPeriodService.create({
          subscriptionId: newSubscription.id!,
          periodStart: addMonthsTZ(nextCutDate, -1),
          periodEnd: nextCutDate,
          dueDate: nextCutDate,
          amount: this.parseAmount(data.amount),
          status: 'pending'
        });
      } catch (err) {
        console.warn('Failed to create initial billing period:', err);
      }
    }

    if (userType === 'admin') {
      try {
        await this.adminsCollection().doc(clientDoc.id).update({
          subscriptionIds: firebaseAdmin.firestore.FieldValue.arrayUnion(docRef.id)
        });
      } catch (err) {
        console.warn('Failed to add subscriptionId to admin subscriptionIds:', err);
      }
    }

    if (clientPhone && communicationsService) {
      try {
        await communicationsService.linkSubscriptionsToConversation(clientPhone, [docRef.id]);
      } catch (err) {
        console.warn('Failed to link subscription to conversation:', err);
      }
    }

    return newSubscription;
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

  async listByClient(clientUidOrId: string, limit?: number, startAfterId?: string) {
    // Try to resolve client doc id from uid
    let clientDocId: string | null = null;
    const clientSnap = await this.clientsCollection().where('uid', '==', clientUidOrId).limit(1).get();
    if (!clientSnap.empty) clientDocId = clientSnap.docs[0].id;

    const candidates: string[] = [];
    if (clientDocId) candidates.push(clientDocId);
    if (clientUidOrId) candidates.push(clientUidOrId);

    let query: any;
    if (candidates.length === 0) {
      // no client resolved
      return [];
    } else if (candidates.length === 1) {
      query = this.collection().where('clientId', '==', candidates[0]).orderBy('createdAt', 'desc');
    } else {
      // Firestore supports 'in' for equality matching
      query = this.collection().where('clientId', 'in', candidates).orderBy('createdAt', 'desc');
    }

    if (startAfterId) {
      const cursorDoc = await this.collection().doc(startAfterId).get();
      if (!cursorDoc.exists) throw new Error('Invalid cursor');
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
    const data: any = { ...patch };

    if (patch.amount !== undefined) {
      data.amount = this.parseAmount(patch.amount);
    }
    if (patch.nextCutDate || patch.cutDate) {
      data.cutDate = patch.nextCutDate || patch.cutDate;
      data.nextCutDate = patch.nextCutDate || patch.cutDate;
    }

    data.updatedAt = firebaseAdmin.firestore.FieldValue.serverTimestamp();
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
    
    // Verificar si la fecha actual es mayor a la fecha de corte
    const today = startOfDayTZ(new Date());
    if (today < baseCut) {
      throw new Error('La fecha de corte aún no ha vencido. No se puede adelantar.');
    }
    
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

  async deleteByClientId(clientId: string) {
      if (!firebaseAdmin) throw new Error('Firebase Admin not initialized');
      const snap = await this.collection().where('clientId', '==', clientId).get();
      if (snap.empty) return;

      const subIdsToDelete = snap.docs.map(doc => doc.id);

      let adminDoc = await this.adminsCollection().doc(clientId).get();
      if (!adminDoc.exists) {
        const qAdmin = await this.adminsCollection().where('uid', '==', clientId).limit(1).get();
        if (!qAdmin.empty) {
          adminDoc = qAdmin.docs[0];
        }
      }

      if (adminDoc.exists) {
        try {
          await this.adminsCollection().doc(adminDoc.id).update({
            subscriptionIds: firebaseAdmin.firestore.FieldValue.arrayRemove(...subIdsToDelete)
          });
        } catch (err) {
          console.warn('Failed to remove subscriptionIds from admin:', err);
        }
      }

      const batch = firebaseAdmin.firestore().batch();
      snap.docs.forEach(doc => {
          batch.delete(doc.ref);
      });
      await batch.commit();
  }
}

const subscriptionService = new SubscriptionService();
export default subscriptionService;
