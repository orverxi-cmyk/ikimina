'use client';

import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { User, LogOut, LogIn, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuth, signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  return (
    <header className="grid grid-cols-3 h-16 w-full items-center border-b border-white/10 bg-black/95 px-4 md:px-10 sticky top-0 z-40 text-white shrink-0 shadow-xl backdrop-blur-sm">
      {/* Left Column: Profile Avatar */}
      <div className="flex items-center justify-start">
        {user ? (
          <Link href="/profile/me">
            <Avatar className="h-9 w-9 border border-white/10 hover:scale-105 transition-transform">
              <AvatarImage src={`https://picsum.photos/seed/${user.uid}/100/100`} />
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {userData?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/5 border border-dashed border-white/20" />
        )}
      </div>

      {/* Center Column: App Branding - Perfectly Centered */}
      <div className="flex items-center justify-center gap-2">
        <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20">
          <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
        </div>
        <span className="font-headline text-base md:text-lg font-bold tracking-tight text-white uppercase whitespace-nowrap">
          Ikimina App
        </span>
      </div>

      {/* Right Column: Actions */}
      <div className="flex items-center justify-end gap-2">
        {user ? (
          <Button 
            variant="ghost" 
            onClick={handleLogout} 
            className="rounded-xl font-bold text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Sign Out</span>
          </Button>
        ) : (
          <Link href="/login">
            <Button size="sm" className="rounded-xl font-bold text-white bg-primary hover:bg-primary/90 h-9 px-4">
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
