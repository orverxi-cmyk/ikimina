'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { User, LogOut, LogIn, Wallet, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuth, signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function Header() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  // Define top-level routes that don't need a back button on mobile
  const isRootLevel = ['/', '/messages', '/profile/me', '/more'].includes(pathname);

  return (
    <header className="grid grid-cols-3 h-16 w-full items-center border-b border-border bg-background px-4 md:px-10 sticky top-0 z-40 shrink-0 shadow-sm backdrop-blur-sm">
      {/* Left Column: Back Button (Mobile) or Profile Avatar */}
      <div className="flex items-center justify-start">
        {!isRootLevel ? (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()} 
            className="md:hidden rounded-full hover:bg-muted -ml-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        ) : null}
        
        {/* On Desktop always show Avatar, on Mobile only if root level or hidden when back button is shown */}
        <div className={!isRootLevel ? "hidden md:block" : "block"}>
          {user ? (
            <Link href="/profile/me">
              <Avatar className="h-9 w-9 border border-border hover:scale-105 transition-transform">
                <AvatarImage src={`https://picsum.photos/seed/${user.uid}/100/100`} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {userData?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <div className="w-9 h-9 rounded-full bg-muted border border-dashed border-border" />
          )}
        </div>
      </div>

      {/* Center Column: App Branding - Perfectly Centered */}
      <div className="flex items-center justify-center gap-2">
        <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20">
          <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
        </div>
        <span className="font-headline text-sm md:text-lg font-bold tracking-tight text-foreground uppercase whitespace-nowrap">
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
