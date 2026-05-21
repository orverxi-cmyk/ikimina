'use client';

import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { User, LogOut, LogIn, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuth, signOut } from 'firebase/auth';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  return (
    <header className="hidden md:flex h-16 w-full items-center justify-between border-b border-white/10 bg-black px-10 sticky top-0 z-40 text-white shrink-0 shadow-lg">
      {/* App Branding in the Top Left */}
      <div className="flex items-center gap-3">
        <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20">
          <Wallet className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="font-headline text-xl font-bold tracking-tight text-white">
          Ikimina App
        </span>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <Button 
              variant="ghost" 
              asChild 
              className="rounded-xl font-bold text-white hover:bg-white/10"
            >
              <Link href="/profile/me">
                <User className="mr-2 h-4 w-4" /> My Profile
              </Link>
            </Button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className="rounded-xl font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </>
        ) : (
          <Link href="/login">
            <Button size="sm" className="rounded-xl font-bold text-white bg-primary hover:bg-primary/90">
              <LogIn className="mr-2 h-4 w-4" /> Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
