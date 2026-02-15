import { IAuthService, AuthUser, Role } from '../auth.types';
import firebaseService from './firebase.service';
import clientService from '../../clients/services/client.service';
import subscriptionService from '../../subscriptions/services/subscription.service';

class AuthService implements IAuthService {
  async createUser(email: string, password: string, displayName?: string) {
    const { uid } = await firebaseService.createUser(email, password, displayName);
    const customToken = await firebaseService.createCustomToken(uid);
    return { uid, customToken };
  }

  async createUserWithRole(email: string, password: string, displayName?: string, role?: Role) {
    const { uid } = await firebaseService.createUser(email, password, displayName);
    if (role) {
      await firebaseService.setCustomClaims(uid, { role });
    }
    return { uid, role: role || null };
  }

  async setRole(uid: string, role: Role): Promise<void> {
    await firebaseService.setCustomClaims(uid, { role });
  }

  async getUserByUid(uid: string): Promise<AuthUser | null> {
    return firebaseService.getUser(uid);
  }

  async loginWithIdToken(idToken: string): Promise<AuthUser> {
    return firebaseService.verifyIdToken(idToken);
  }

  async updateUser(uid: string, data: { email?: string; password?: string; displayName?: string; role?: Role; disabled?: boolean }) {
    // 1. Update basic info in Firebase Auth
    const { role, ...basicData } = data;
    if (Object.keys(basicData).length > 0) {
      await firebaseService.updateUser(uid, basicData);
    }

    // 2. Update role (custom claims) if provided
    if (role) {
      await this.setRole(uid, role);
    }
    
    // 3. Return updated user
    return this.getUserByUid(uid);
  }

  async listUsers(pageToken?: string, limit?: number) {
    return firebaseService.listUsers(pageToken, limit);
  }

  async deleteUser(uid: string): Promise<void> {
    // 1. Delete user from Firebase Auth
    await firebaseService.deleteUser(uid);

    // 2. Try to find and delete client profile if exists
    // The previous token is already invalid, so we just clean up by UID
    try {
        const deletedClientIds = await clientService.deleteByUid(uid);
        
        // 3. If client profile was found, delete associated subscriptions
        if (deletedClientIds && deletedClientIds.length > 0) {
            for (const clientId of deletedClientIds) {
                await subscriptionService.deleteByClientId(clientId);
            }
        }
    } catch (err) {
        // Log cleanup error but don't fail the main request since Auth user is already deleted
        console.error(`[deleteUser] Failed to cleanup client data for uid ${uid}`, err);
    }
  }
}

const authService = new AuthService();
export default authService;
