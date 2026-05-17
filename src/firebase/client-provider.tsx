'use client';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from '.';
import { useMemo } from 'react';

import type { ReactNode } from 'react';

/**
 * A client-side provider that initializes Firebase and provides it to the
 * rest of the application.
 */
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const firebase = useMemo(() => initializeFirebase(), []);
  return (
    <FirebaseProvider app={firebase.app} auth={firebase.auth} firestore={firebase.firestore}>
      {children}
    </FirebaseProvider>
  );
}
