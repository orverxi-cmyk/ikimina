'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  Query,
  QuerySnapshot,
} from 'firebase/firestore';
import { onSnapshot, DocumentReference } from 'firebase/firestore';

import { useFirestore } from '../provider';
import { errorEmitter }from '@/firebase/error-emitter';
import {
  FirestorePermissionError,
  type SecurityRuleContext,
} from '@/firebase/errors';

export function useDoc<T>(ref: DocumentReference<T> | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ref) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setLoading(false);
        setError(null);
      },
      async (err) => {
        const isPermissionDenied = (err as any)?.code === 'permission-denied';
        if (isPermissionDenied) {
          const permissionError = new FirestorePermissionError({
            path: ref.path,
            operation: 'get',
          } satisfies SecurityRuleContext);
          setError(permissionError);
          errorEmitter.emit('permission-error', permissionError);
        } else {
          setError(err);
        }
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ref]);

  return { data, loading, error };
}

export function useCollection<T>(query: Query<T> | null) {
  const [data, setData] = useState<QuerySnapshot<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!query) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query,
      (snap) => {
        setData(snap);
        setLoading(false);
        setError(null);
      },
      async (err) => {
        const isPermissionDenied = (err as any)?.code === 'permission-denied';
        if (isPermissionDenied) {
          // Attempt to extract the path for professional error reporting
          let path = '(collection query)';
          if ('path' in query) {
            path = (query as any).path;
          } else if ((query as any)._query?.path) {
            path = (query as any)._query.path.toString();
          }

          const permissionError = new FirestorePermissionError({
            path,
            operation: 'list',
          } satisfies SecurityRuleContext);
          setError(permissionError);
          errorEmitter.emit('permission-error', permissionError);
        } else {
          setError(err);
        }
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [query]);

  return { data, loading, error };
}

/**
 * A hook to memoize a Firestore query or document reference. This is useful
 * when you want to pass a query to a hook like `useCollection` or `useDoc`
 * without causing an infinite loop.
 *
 * @param factory A function that returns a Firestore query or document reference.
 * @param deps The dependencies of the query.
 * @returns The memoized query or document reference.
 */
export function useMemoFirebase<T extends DocumentReference | Query>(
  factory: () => T | null,
  deps: React.DependencyList
) {
  const firestore = useFirestore();
  return useMemo(factory, [firestore, ...deps]);
}
