import firebaseAdmin from '../../config/firebaseAdmin';
import { AuthUser, IFirebaseService, Role } from '../auth.types';

class FirebaseService implements IFirebaseService {
  async verifyIdToken(idToken: string): Promise<AuthUser> {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    const decodedRecord = decoded as Record<string, unknown>;
    const role = typeof decodedRecord['role'] === 'string' ? (decodedRecord['role'] as Role) : undefined;
    const name = typeof decodedRecord['name'] === 'string' ? (decodedRecord['name'] as string) : undefined;
    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email || undefined,
      role,
      name
    };
    return user;
  }

  async createUser(email: string, password: string, displayName?: string): Promise<{ uid: string }> {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    const userRecord = await firebaseAdmin.auth().createUser({ email, password, displayName });
    return { uid: userRecord.uid };
  }

  async createCustomToken(uid: string): Promise<string> {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    return firebaseAdmin.auth().createCustomToken(uid);
  }

  async setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    await firebaseAdmin.auth().setCustomUserClaims(uid, claims);
  }

  async getUser(uid: string): Promise<AuthUser | null> {
    if (!firebaseAdmin) {
      throw new Error('Firebase Admin not initialized');
    }
    const userRecord = await firebaseAdmin.auth().getUser(uid);
    const claims = (userRecord.customClaims || {}) as Record<string, unknown>;
    const role = typeof claims['role'] === 'string' ? (claims['role'] as Role) : undefined;
    const user: AuthUser = {
      uid: userRecord.uid,
      email: userRecord.email || undefined,
      role,
      name: userRecord.displayName || undefined
    };
    return user;
  }
}

const firebaseService = new FirebaseService();
export default firebaseService;
