import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'longview-505611';

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'longview-local-emulator',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || 'longview-local-emulator'
    });

export const auth = getAuth(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false') {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already')) throw error;
  }
}

export { app };
