'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { parseAppError } from '@/lib/error-handler';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const onPermissionError = (error: Error) => {
      console.warn('[Firebase Security Rules Audit]:', error.message);
      
      const parsed = parseAppError(error);
      toast({
        variant: 'destructive',
        title: parsed.title || 'Access Restricted',
        description: parsed.message || 'You do not have permission to perform this database operation.',
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const parsed = parseAppError(reason);
      
      // If it's a network, auth, or permission error, handle graciously and prevent console crash
      if (parsed.isNetworkError || parsed.category === 'auth' || parsed.category === 'permission') {
        event.preventDefault();
        toast({
          variant: parsed.severity === 'warning' ? 'default' : 'destructive',
          title: parsed.title,
          description: parsed.message,
        });
      }
    };

    errorEmitter.on('permission-error', onPermissionError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      errorEmitter.off('permission-error', onPermissionError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [toast]);

  return null;
}
