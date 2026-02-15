import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import firebaseAdmin from '../config/firebaseAdmin';

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: ts-node src/scripts/set-admin-role.ts <UID>');
  process.exit(1);
}

if (!firebaseAdmin) {
  console.error('Firebase Admin SDK not initialized or GOOGLE_APPLICATION_CREDENTIALS missing');
  process.exit(2);
}

const admin = firebaseAdmin;

async function main() {
  await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
  console.log(`Assigned role=admin to uid=${uid}`);
}

main().catch((err) => {
  console.error('Failed to set admin role:', err?.message || err);
  process.exit(3);
});
