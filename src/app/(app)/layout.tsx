'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AppFooter } from "@/components/layout/app-footer";
import { useUser } from '@/firebase/auth/use-user';
import { Loader2 } from 'lucide-react';
import { SettingsProvider } from '@/context/settings-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user && mounted) {
      router.push('/login');
    }
  }, [user, loading, router, mounted]);

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SettingsProvider>
      <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
        {/* Global Full-Width Header */}
        <Header />

        <div className="flex-1 flex overflow-hidden relative">
          {/* Workspace Container with spacing around Sidebar and Content */}
          <div className="flex flex-1 w-full p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
            {/* Floating Sidebar */}
            <AppSidebar />
            
            {/* Main Application Window */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden rounded-[10px] relative min-w-0 flex flex-col">
              <div className="flex-1 min-w-0 w-full">
                {children}
              </div>
              <AppFooter />
            </main>
          </div>
        </div>

        <MobileNav />
        {/* Spacer for Mobile Navigation */}
        <div className="h-16 md:hidden shrink-0" />
      </div>
    </SettingsProvider>
  );
}
