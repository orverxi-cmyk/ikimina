'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { User, LogOut, LogIn, Wallet, ChevronLeft, UserX, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuth, signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSettings } from '@/context/settings-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { user } = useUser();
  const { settings } = useSettings();
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
    <header className="grid grid-cols-3 h-16 w-full items-center border-b border-white/10 bg-primary px-4 md:px-10 sticky top-0 z-[60] shrink-0 shadow-lg">
      {/* Left Column: Back Button (Mobile) or Profile Avatar with Member Menu */}
      <div className="flex items-center justify-start">
        {!isRootLevel ? (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()} 
            className="md:hidden rounded-full hover:bg-white/10 text-white -ml-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        ) : null}
        
        {/* On Desktop always show Avatar, on Mobile only if root level or hidden when back button is shown */}
        <div className={!isRootLevel ? "hidden md:block" : "block"}>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="rounded-full focus:outline-none ring-2 ring-transparent hover:ring-white/50 transition-all p-0.5"
                  title="Member Menu & Options"
                >
                  <Avatar className="h-9 w-9 border border-white/20 hover:scale-105 transition-transform cursor-pointer">
                    <AvatarImage src={userData?.photoURL || user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`} />
                    <AvatarFallback className="bg-white/20 text-white font-bold">
                      {userData?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 mt-2 rounded-xl shadow-xl bg-card border border-border">
                <DropdownMenuLabel className="font-bold text-xs truncate py-2 px-3">
                  <p className="truncate text-foreground">{userData?.name || 'My Account'}</p>
                  <p className="text-[10px] font-normal text-muted-foreground truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/me" className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2">
                    <User className="h-4 w-4 text-primary" />
                    <span>My Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/contributions" className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span>My Contributions</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/loans" className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2">
                    <Landmark className="h-4 w-4 text-primary" />
                    <span>Loan Portfolio</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link 
                    href="/profile/me?tab=account" 
                    className="cursor-pointer flex items-center gap-2 text-xs font-bold text-destructive focus:text-destructive focus:bg-destructive/10 py-2"
                  >
                    <UserX className="h-4 w-4 text-destructive" />
                    <span>Delete Account</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer flex items-center gap-2 text-xs font-semibold text-muted-foreground py-2">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/10 border border-dashed border-white/20" />
          )}
        </div>
      </div>

      {/* Center Column: App Branding - Perfectly Centered */}
      <div className="flex items-center justify-center gap-2">
        <div className="bg-white p-1.5 rounded-lg shadow-lg">
          <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary" />
        </div>
        <span className="font-headline text-sm md:text-lg font-bold tracking-tight text-white uppercase whitespace-nowrap">
          {settings.appName?.trim() || 'Ikimina App'}
        </span>
      </div>

      {/* Right Column: Actions */}
      <div className="flex items-center justify-end gap-2">
        {user ? (
          <Button 
            variant="ghost" 
            onClick={handleLogout} 
            className="rounded-xl font-bold text-white hover:bg-white/10 h-9 px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Sign Out</span>
          </Button>
        ) : (
          <Link href="/login">
            <Button size="sm" className="rounded-xl font-bold text-primary bg-white hover:bg-white/90 h-9 px-4">
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
