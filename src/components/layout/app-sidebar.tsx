'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  HandCoins, 
  FileText, 
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <aside className="hidden md:flex flex-col w-64 rounded-3xl bg-black p-6">
        <div className="animate-pulse flex flex-col gap-2">
          <div className="h-2 w-24 bg-white/10 rounded" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
      </aside>
    );
  }

  const role = userData?.role || 'member';

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/loans', label: 'Loans', icon: HandCoins },
  ];

  if (role === 'admin' || role === 'management') {
    menuItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }

  if (role === 'admin') {
    menuItems.push({ href: '/members', label: 'Members', icon: Users });
    menuItems.push({ href: '/admin/settings', label: 'Settings', icon: Settings });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-black p-6 space-y-8 rounded-[2rem] shadow-2xl border border-white/5 shrink-0">
      {/* Internal System Status relocated from Header */}
      <div className="flex flex-col gap-1 px-4 py-3 border-b border-white/10">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
          Internal System
        </h2>
        <span className="text-xs font-bold text-primary">
          {role === 'admin' ? 'Administrator Console' : role === 'management' ? 'Management Console' : 'Member Portal'}
        </span>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-200',
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]' 
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t border-white/10">
        {user && (
          <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Session</p>
            <p className="text-sm font-bold truncate text-white">{userData?.name || user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-primary font-bold uppercase tracking-tight">{role}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
