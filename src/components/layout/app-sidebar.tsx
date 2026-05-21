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
  Settings,
  Landmark
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
      <aside className="hidden md:flex flex-col w-64 rounded-[10px] bg-background p-6">
        <div className="animate-pulse flex flex-col gap-2">
          <div className="h-2 w-24 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </aside>
    );
  }

  const role = userData?.role || 'member';

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/loans', label: 'Loan Portfolio', icon: Landmark },
    { href: '/loans/apply', label: 'Apply for Loan', icon: HandCoins },
  ];

  if (role === 'admin' || role === 'management') {
    menuItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }

  if (role === 'admin') {
    menuItems.push({ href: '/members', label: 'Members', icon: Users });
    menuItems.push({ href: '/admin/settings', label: 'Settings', icon: Settings });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-background p-6 space-y-8 rounded-[10px] shadow-sm border border-border shrink-0">
      {/* Internal System Status */}
      <div className="flex flex-col gap-1 px-4 py-3 border-b border-border">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Internal System
        </h2>
        <span className="text-sm font-bold text-primary">
          {role === 'admin' ? 'Administrator Console' : role === 'management' ? 'Management Console' : 'Member Portal'}
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-bold transition-all duration-200',
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t border-border">
        {user && (
          <div className="px-4 py-3 bg-muted rounded-[10px] border border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Session</p>
            <p className="text-sm font-bold truncate text-foreground">{userData?.name || user.email}</p>
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
