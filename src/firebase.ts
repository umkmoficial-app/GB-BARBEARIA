import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Import default configuration
import defaultConfig from '../firebase-applet-config.json';

// Helper to get active configuration (supports custom config stored locally if user requested)
export function getActiveFirebaseConfig() {
  try {
    const custom = localStorage.getItem('custom_firebase_config');
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.projectId && parsed.apiKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading custom Firebase config:', e);
  }
  return defaultConfig;
}

const firebaseConfig = getActiveFirebaseConfig();

// Initialize or reuse Firebase app instance
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const dbId = firebaseConfig.firestoreDatabaseId;
export const db = (dbId && dbId !== '(default)' && dbId !== '') 
  ? getFirestore(app, dbId) 
  : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

