// Firebase bootstrap: App, App Check (required by Firebase AI Logic), AI Logic,
// Auth, Firestore (offline-capable) and Remote Config.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getRemoteConfig, type RemoteConfig } from 'firebase/remote-config';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export interface FirebaseServices {
  app: FirebaseApp;
  ai: AI;
  auth: Auth;
  db: Firestore;
  remoteConfig: RemoteConfig;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured. Copy web/.env.example to web/.env and fill it in.');
  }
  const app = initializeApp(firebaseConfig);

  // App Check must be initialised before any AI Logic call.
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken === 'true' ? true : debugToken;
  }
  const enterpriseKey = env.VITE_RECAPTCHA_ENTERPRISE_KEY;
  const v3Key = env.VITE_RECAPTCHA_V3_KEY;
  // When only a debug token is supplied, the provider key is never used to
  // attest, but initializeAppCheck still needs a provider instance.
  const provider = enterpriseKey
    ? new ReCaptchaEnterpriseProvider(enterpriseKey)
    : new ReCaptchaV3Provider(v3Key || 'debug-only');
  initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const remoteConfig = getRemoteConfig(app);
  services = { app, ai, auth, db, remoteConfig };
  return services;
}
