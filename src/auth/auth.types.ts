export type Role = 'admin' | 'staff' | 'client' | 'guest';

export interface AuthUser {
  uid: string;
  email?: string;
  role?: Role;
  name?: string;
  // allow additional safe fields coming from token
  [key: string]: string | undefined;
}

export interface IAuthService {
  createUser(email: string, password: string, displayName?: string): Promise<{ uid: string; customToken?: string }>;
  createUserWithRole(email: string, password: string, displayName?: string, role?: Role): Promise<{ uid: string; role: Role | null }>;
  setRole(uid: string, role: Role): Promise<void>;
  getUserByUid(uid: string): Promise<AuthUser | null>;
  loginWithIdToken(idToken: string): Promise<AuthUser>;
}

export interface IFirebaseService {
  verifyIdToken(idToken: string): Promise<AuthUser>;
  createUser(email: string, password: string, displayName?: string): Promise<{ uid: string }>;
  setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(uid: string): Promise<AuthUser | null>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      validatedData?: unknown;
      requestId?: string;
    }
  }
}
