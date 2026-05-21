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
    <header className="flex h-16 w-full items-center justify-between border-b border-white/10 bg-black px-4 md:px-10 sticky top-0 z-40 text-white shrink-0 shadow-lg">
      {/* App Branding in the Top Left */}
      <div className="flex items-center gap-3">
        <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20">
          <Wallet className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
        </div>
        <span className="font-headline text-lg md:text-xl font-bold tracking-tight text-white">
          Ikimina App
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {user ? (
          <>
            <Button 
              variant="ghost" 
              asChild 
              className="rounded-xl font-bold text-white hover:bg-white/10 h-9 px-3 md:h-10 md:px-4"
            >
              <Link href="/profile/me">
                <User className="mr-2 h-4 w-4" /> 
                <span className="hidden sm:inline">My Profile</span>
              </Link>
            </Button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className="rounded-xl font-bold text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-3 md:h-10 md:px-4"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </>
        ) : (
          <Link href="/login">
            <Button size="sm" className="rounded-xl font-bold text-white bg-primary hover:bg-primary/90 h-9 px-3">
              <LogIn className="mr-2 h-4 w-4" /> Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
