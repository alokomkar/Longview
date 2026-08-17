import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
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
  observe(listener) {
    return onAuthStateChanged(auth, user => listener(user ? mapUser(user) : null));
  },
  async signInAnonymously() {
    await signInAnonymously(auth);
  },
  async linkGoogle() {
    if (!auth.currentUser) throw new Error('No authenticated user to link');
    await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
  },
  async signInGoogle() {
    await signInWithPopup(auth, new GoogleAuthProvider());
  },
  async signOut() {
    await signOut(auth);
  }
};
