'use client';
import { createContext, useContext, type ReactNode } from 'react';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

export const FirebaseContext = createContext<{
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
} | null>(null);

/**
 * The primary Firebase provider. It requires the Firebase app, auth, and
 * firestore instances to be passed in as props. It also sets up the
* {@link FirebaseErrorListener} to display errors in the Next.js dev overlay.
 */
export function FirebaseProvider({
  children,
  ...props
}: {
  children: ReactNode;
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}) {
  return (
    <FirebaseContext.Provider value={props}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
}

/**
 * A hook to get the Firebase app, auth, and firestore instances.
 * @returns The Firebase app, auth, and firestore instances.
 * @throws An error if the hook is not used within a {@link FirebaseProvider}.
 */
export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}

export const useFirebaseApp = () => useFirebase().app;
export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
