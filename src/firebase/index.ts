import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { firebaseConfig } from './config';

// The side effect of this function is that it initializes the Firebase app
// and connects to the emulators if they are running.
export function initializeFirebase(): {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
} {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  return { app, auth, firestore };
}

export {
  useCollection,
  useDoc,
} from '@/firebase/firestore/hooks';
export { useUser } from '@/firebase/auth/use-user';
export { FirebaseClientProvider } from '@/firebase/client-provider';
export {
  FirebaseProvider,
  useFirebaseApp,
  useFirestore,
  useAuth,
} from '@/firebase/provider';