import admin from 'firebase-admin';
import firebaseAdmin from '../config/firebaseAdmin';

async function main() {
  if (!firebaseAdmin) {
    console.error('Firebase Admin not initialized. Check GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(2);
  }
  const uid = process.argv[2] || 'client-test-1';
  try {
    const clients = firebaseAdmin.firestore().collection('clients');
    // create or update a client doc with uid and phone
    const q = await clients.where('uid', '==', uid).limit(1).get();
    if (!q.empty) {
      const doc = q.docs[0];
      await doc.ref.update({ name: 'Client Test', phone: process.env.TEST_PHONE || process.env.TWILIO_FROM_NUMBER || '+10000000000', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(JSON.stringify({ id: doc.id, uid }));
      process.exit(0);
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = await clients.add({ uid, name: 'Client Test', phone: process.env.TEST_PHONE || process.env.TWILIO_FROM_NUMBER || '+10000000000', createdAt: now, updatedAt: now });
    console.log(JSON.stringify({ id: docRef.id, uid }));
    process.exit(0);
  } catch (err: any) {
    console.error('Error creating test client', err?.message || err);
    process.exit(1);
  }
}

main();
