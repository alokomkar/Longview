import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { app } from './config';

export const db = getFirestore(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR !== 'false') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already')) throw error;
  }
}
