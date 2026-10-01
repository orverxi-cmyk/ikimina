'use client';
/**
 * @fileOverview SettingsContext — the single source of truth for system-wide
 * financial policy settings on the client.
 *
 * ARCHITECTURE CONTRACT:
 *  - Settings are fetched ONCE via the `getSystemSettings` Cloud Function.
 *  - NO page or component may read `settings/financials` from Firestore directly.
 *  - After an admin updates settings (via `updateFinancialSettings`), call
 *    `refreshSettings()` from this context to re-fetch from the function.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { getSystemSettingsAction, DEFAULT_SETTINGS, type SystemSettings } from '@/lib/finance-client';

type SettingsContextValue = {
  settings: SystemSettings;
  loading: boolean;
  /** Re-fetches settings from the Cloud Function — call after a successful settings update. */
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useUser();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSystemSettingsAction();
      setSettings(data);
    } catch (err) {
      console.error('SettingsProvider: failed to load settings', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch once the Firebase auth session is ready and a user is signed in.
    if (!authLoading && user) {
      fetchSettings();
    } else if (!authLoading && !user) {
      // Reset to defaults when signed out
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
    }
  }, [authLoading, user, fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Returns the current system settings and a `refreshSettings` function.
 *
 * @example
 * const { settings, loading } = useSettings();
 * const currency = settings.currency; // 'RWF' | 'USD'
 */
export function useSettings() {
  return useContext(SettingsContext);
}
