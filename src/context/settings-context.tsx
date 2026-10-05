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

const SETTINGS_CACHE_KEY = 'ikimina_system_settings';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useUser();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Safely hydrate cached settings on client mount after initial SSR render
  useEffect(() => {
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (cached) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(cached) });
      }
    } catch (e) {}
  }, []);

  const fetchSettings = useCallback(async () => {
    // Only call the Cloud Function when authenticated.
    // Unauthenticated visitors (e.g. on /login) use cached or default branding to avoid 401.
    if (!user) {
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
          if (cached) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(cached) });
        } catch (e) {}
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getSystemSettingsAction();
      setSettings(data);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
        } catch (e) {}
      }
    } catch (err) {
      console.warn('SettingsProvider: failed to load settings from cloud function', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchSettings();
    }
  }, [fetchSettings, authLoading]);

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
