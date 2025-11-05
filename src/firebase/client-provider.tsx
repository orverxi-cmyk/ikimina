'use client';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from '.';

import type { ReactNode } from 'react';

/**
 * A client-side provider that initializes Firebase and provides it to the
 * rest of the application.
 */
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const { app, auth, firestore } = initializeFirebase();
  return (
    <FirebaseProvider app={app} auth={auth} firestore={firestore}>
      {children}
    </FirebaseProvider>
  );
}
