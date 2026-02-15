import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import firebaseAdmin from '../config/firebaseAdmin';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Usage example:
// npx ts-node src/scripts/get-idtoken.ts --email "adrian@email.com" --password "12345678"

type Args = {
  email?: string;
  password?: string;
  uid?: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email' && args[i + 1]) {
      out.email = args[i + 1];
      i++;
    } else if (a === '--password' && args[i + 1]) {
      out.password = args[i + 1];
      i++;
    } else if (a === '--uid' && args[i + 1]) {
      out.uid = args[i + 1];
      i++;
    }
  }
  return out;
}

async function signInWithPassword(email: string, password: string) {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  if (!apiKey) throw new Error('FIREBASE API key not configured');
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  const resp = await axios.post(url, { email, password, returnSecureToken: true }, { headers: { 'Content-Type': 'application/json' } });
  const data = resp.data as { idToken: string; refreshToken?: string; expiresIn?: string; localId?: string };
  return { idToken: data.idToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn, uid: data.localId };
}

async function signInWithCustomToken(customToken: string) {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  if (!apiKey) throw new Error('FIREBASE API key not configured');
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  const resp = await axios.post(url, { token: customToken, returnSecureToken: true }, { headers: { 'Content-Type': 'application/json' } });
  const data = resp.data as { idToken: string; refreshToken?: string; expiresIn?: string; localId?: string };
  return { idToken: data.idToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn, uid: data.localId };
}

async function main() {
  const { email, password, uid } = parseArgs();
  if (email && password) {
    try {
      const result = await signInWithPassword(email, password);
      console.log(JSON.stringify({ uid: result.uid || null, idToken: result.idToken, refreshToken: result.refreshToken || null, expiresIn: result.expiresIn || null }));
      process.exit(0);
    } catch (err: any) {
      console.error('Error signing in with email/password:', err.message || err);
      process.exit(2);
    }
  }

  if (uid) {
    if (!firebaseAdmin) {
      console.error('Firebase Admin SDK not initialized or GOOGLE_APPLICATION_CREDENTIALS missing');
      process.exit(3);
    }
    try {
      const customToken = await firebaseAdmin.auth().createCustomToken(uid);
      const apiKey = process.env.FIREBASE_API_KEY || '';
      if (!apiKey) {
        // If API key is not configured, return the customToken so the client can exchange it.
        console.log(JSON.stringify({ uid, customToken }));
        console.error('NOTE: FIREBASE_API_KEY missing — returned customToken only. To get idToken automatically, set FIREBASE_API_KEY in .env');
        process.exit(0);
      }
      const result = await signInWithCustomToken(customToken);
      console.log(JSON.stringify({ uid: result.uid || uid || null, idToken: result.idToken, refreshToken: result.refreshToken || null, expiresIn: result.expiresIn || null }));
      process.exit(0);
    } catch (err: any) {
      console.error('Error creating/exchanging custom token:', err.message || err);
      process.exit(4);
    }
  }

  console.error('Usage: ts-node src/scripts/get-idtoken.ts --email <email> --password <password> OR --uid <uid>');
  process.exit(1);
}

main();
