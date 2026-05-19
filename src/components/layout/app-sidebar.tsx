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
  LogOut, 
  Settings,
  UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { getAuth, signOut } from 'firebase/auth';

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

  const handleLogout = async () => {
    const auth = getAuth();
    await signOut(auth);
  };

  if (!mounted) {
    return (
      <aside className="hidden md:flex flex-col w-64 border-r bg-card p-6 space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-primary p-2 rounded-lg">
            <Wallet className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="font-headline text-xl font-bold tracking-tight text-foreground">Ikimina App</span>
        </div>
      </aside>
    );
  }

  const role = userData?.role || 'member';

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/loans', label: 'Loans', icon: HandCoins },
    { href: '/profile/me', label: 'My Profile', icon: UserCircle },
  ];

  if (role === 'admin' || role === 'management') {
    menuItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }

  if (role === 'admin') {
    menuItems.push({ href: '/members', label: 'Members', icon: Users });
    menuItems.push({ href: '/admin/settings', label: 'Settings', icon: Settings });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-card p-6 space-y-6">
      <div className="flex items-center gap-3 px-2">
        <div className="bg-primary p-2 rounded-lg shadow-lg shadow-primary/20">
          <Wallet className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="font-headline text-xl font-bold tracking-tight text-foreground">Ikimina App</span>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all',
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t border-border/50">
        {user && (
          <div className="space-y-2">
            <div className="px-4 py-3 bg-accent/30 rounded-xl mb-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Authenticated</p>
              <p className="text-sm font-bold truncate text-foreground">{userData?.name || user.email}</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] text-primary font-bold uppercase tracking-tight">{role}</span>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
