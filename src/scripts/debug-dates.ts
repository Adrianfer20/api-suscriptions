
require('dotenv').config();
import firebaseAdmin from '../config/firebaseAdmin';

async function checkDate() {
  if (!firebaseAdmin) throw new Error('Admin not initialized');
  const subs = await firebaseAdmin.firestore().collection('subscriptions').get();
  
  console.log('--- Checking Subscriptions ---');
  subs.docs.forEach((doc: any) => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  Status: "${data.status}"`);
    console.log(`  CutDate: "${data.cutDate}" (Type: ${typeof data.cutDate})`);
  });
}

checkDate().catch(e => console.error(e));
