export type AuthUser = {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
};

export type AuthFailure =
  | 'cancelled'
  | 'popup-blocked'
  | 'account-conflict'
  | 'offline'
  | 'unknown';

export type AuthSnapshot =
  | { status: 'loading' }
  | { status: 'signed-out'; failure?: AuthFailure }
  | { status: 'authenticated'; user: AuthUser; linking: boolean; failure?: AuthFailure };

export interface AuthGateway {
  observe(listener: (user: AuthUser | null) => void): () => void;
  signInAnonymously(): Promise<void>;
  linkGoogle(): Promise<void>;
  signInGoogle(): Promise<void>;
}
