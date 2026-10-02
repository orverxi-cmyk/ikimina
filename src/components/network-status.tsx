'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  });
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Auto-hide the "Back online" state after 4 seconds
      const timer = setTimeout(() => {
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}

export function NetworkStatusBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      // Lightweight fetch to test connectivity
      await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' });
      // If successful, reload or force online
      window.location.reload();
    } catch {
      // Still offline
    } finally {
      setIsChecking(false);
    }
  }, []);

  // When back online after being offline
  if (isOnline && wasOffline) {
    return (
      <div 
        role="status"
        aria-live="polite"
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-green-600 text-white rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-300"
      >
        <Wifi className="h-4 w-4" />
        <span>Connection restored. Back online.</span>
      </div>
    );
  }

  // When offline
  if (!isOnline) {
    return (
      <div 
        role="alert"
        aria-live="assertive"
        className="fixed top-0 left-0 right-0 z-[100] bg-black text-white px-4 py-2.5 text-xs shadow-xl border-b border-border/40 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top duration-300"
      >
        <div className="flex items-center gap-2.5 mx-auto max-w-7xl w-full justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-full bg-white/10 shrink-0">
              <WifiOff className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-[11px] sm:text-xs">
              No Internet Connection. You are currently offline. Actions requiring server communication are paused.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={checkConnection}
            disabled={isChecking}
            className="h-7 text-[10px] sm:text-xs font-bold rounded-lg border-white/30 text-black bg-white hover:bg-white/90 shrink-0 gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Check Connection'}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
