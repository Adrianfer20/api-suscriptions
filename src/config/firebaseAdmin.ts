import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let adminApp: admin.app.App | null = null;
let adminInstance: typeof admin | null = null;

function throwIfProduction(message: string) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
}

// 1. Try to initialize from environment variable (ideal for production/cloud)
const credsEnv = process.env.FIREBASE_ADMIN_CREDENTIALS;
let serviceAccount: admin.ServiceAccount | undefined;

if (credsEnv) {
  try {
    serviceAccount = JSON.parse(credsEnv);
    console.info('[firebaseAdmin] initializing with FIREBASE_ADMIN_CREDENTIALS env var');
  } catch (e) {
    console.error('[firebaseAdmin] Failed to parse FIREBASE_ADMIN_CREDENTIALS', e);
    throwIfProduction('Invalid FIREBASE_ADMIN_CREDENTIALS JSON');
  }
} 

// 2. Fallback to file path (ideal for local dev)
if (!serviceAccount && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const saPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (fs.existsSync(saPath)) {
    try {
      serviceAccount = require(saPath) as admin.ServiceAccount;
      console.info(`[firebaseAdmin] initializing with file at ${saPath}`);
    } catch (e) {
      console.error(`[firebaseAdmin] Failed to load credentials from ${saPath}`, e);
    }
  } else {
    console.warn(`[firebaseAdmin] File ${saPath} not found`);
  }
}

// 3. Initialize App
if (serviceAccount) {
    try {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      adminInstance = admin;
    } catch (err: any) {
      console.error('[firebaseAdmin] initialization error', err);
      throwIfProduction('Failed to initialize Firebase Admin SDK');
    }
} else {
  const msg = 'No valid Firebase credentials found (env or file)';
  console.warn(`[firebaseAdmin] ${msg}`);
  throwIfProduction(msg);
}

// Export the admin module if initialized, otherwise null. Callers should
// check for null and handle missing admin accordingly.
const exported = adminInstance ? adminInstance : null;
export default exported;
