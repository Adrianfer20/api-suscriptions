import firebaseAdmin from '../config/firebaseAdmin';

async function main() {
  const uid = process.argv[2] || 'test-admin-uid';
  if (!firebaseAdmin) {
    console.error('Firebase Admin not initialized. Check GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(2);
  }
  try {
    // create user if not exists
    try {
      await firebaseAdmin.auth().getUser(uid);
      console.log(`User ${uid} already exists`);
    } catch (err) {
      await firebaseAdmin.auth().createUser({ uid, displayName: 'Test Admin' });
      console.log(`Created user ${uid}`);
    }

    await firebaseAdmin.auth().setCustomUserClaims(uid, { role: 'admin' });
    console.log(`Set custom claims role=admin for ${uid}`);
    console.log(JSON.stringify({ uid }));
    process.exit(0);
  } catch (err: any) {
    console.error('Error setting up admin user', err?.message || err);
    process.exit(1);
  }
}

main();
