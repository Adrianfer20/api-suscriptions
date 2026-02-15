import { IAuthService, AuthUser, Role } from '../auth.types';
import firebaseService from './firebase.service';

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
}

const authService = new AuthService();
export default authService;
