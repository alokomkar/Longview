import {
  getRedirectResult,
  GoogleAuthProvider,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithRedirect,
  signOut
} from 'firebase/auth';
import { auth } from '../firebase/config';
import type { AuthGateway, AuthUser } from './types';

const mapUser = (user: { uid: string; isAnonymous: boolean; displayName: string | null }): AuthUser => ({
  uid: user.uid,
  isAnonymous: user.isAnonymous,
  displayName: user.displayName
});

export const firebaseAuthGateway: AuthGateway = {
  async completeRedirectSignIn() {
    await getRedirectResult(auth);
  },
  observe(listener) {
    return onAuthStateChanged(auth, user => listener(user ? mapUser(user) : null));
  },
  async signInAnonymously() {
    await signInAnonymously(auth);
  },
  async linkGoogle() {
    if (!auth.currentUser) throw new Error('No authenticated user to link');
    await linkWithRedirect(auth.currentUser, new GoogleAuthProvider());
  },
  async signInGoogle() {
    await signInWithRedirect(auth, new GoogleAuthProvider());
  },
  async signOut() {
    await signOut(auth);
  }
};
