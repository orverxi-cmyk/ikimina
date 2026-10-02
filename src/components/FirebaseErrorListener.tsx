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

    errorEmitter.on('permission-error', onPermissionError);
    return () => {
      errorEmitter.off('permission-error', onPermissionError);
    };
  }, [toast]);

  return null;
}
