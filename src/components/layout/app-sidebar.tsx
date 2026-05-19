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
  LogIn,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          <span className="font-headline text-xl font-bold tracking-tight">Ikimina App</span>
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

  if (role === 'admin') {
    menuItems.push({ href: '/members', label: 'Members', icon: Users });
    menuItems.push({ href: '/admin/settings', label: 'Settings', icon: Settings });
  }

  if (role === 'admin' || role === 'management') {
    menuItems.push({ href: '/reports', label: 'Reports', icon: FileText });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-card p-6 space-y-6">
      <div className="flex items-center gap-3 px-2">
        <div className="bg-primary p-2 rounded-lg">
          <Wallet className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="font-headline text-xl font-bold tracking-tight">Ikimina App</span>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:bg-accent',
                isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t">
        {user ? (
          <div className="space-y-4">
            <div className="px-4 py-2 bg-accent/50 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signed in as</p>
              <p className="text-sm font-medium truncate">{userData?.name || user.email}</p>
              <p className="text-[10px] text-primary font-bold uppercase">{role}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        ) : (
          <Link href="/login">
            <Button className="w-full">
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </aside>
  );
}
