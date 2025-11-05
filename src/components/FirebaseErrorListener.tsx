'use client';

import { useEffect } from 'react';

import { errorEmitter } from '@/firebase/error-emitter';

export function FirebaseErrorListener() {
  useEffect(() => {
    const onPermissionError = (error: Error) => {
      // This is a hack to get the error to show up in the Next.js dev overlay.
      // The Next.js dev overlay only shows uncaught exceptions.
      // By throwing the error in a timeout, we can make it appear as an
      // uncaught exception.
      setTimeout(() => {
        throw error;
      });
    };
    errorEmitter.on('permission-error', onPermissionError);
    return () => {
      errorEmitter.off('permission-error', onPermissionError);
    };
  }, []);

  return null;
}
