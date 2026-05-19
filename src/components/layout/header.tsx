'use client';

import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { getAuth, signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { LogOut, User, Settings, Shield } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  const role = userData?.role || 'member';

  return (
    <header className="hidden md:flex h-16 items-center justify-between border-b bg-card px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        {/* Placeholder for page-specific titles or breadcrumbs if needed in future */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {role === 'admin' ? 'Administrator Portal' : 'Member Workspace'}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right hidden lg:block">
              <p className="text-sm font-bold leading-none">{userData?.name || user.email}</p>
              <p className="text-[10px] text-primary font-bold uppercase mt-1">{role}</p>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full border-2 border-primary/20 p-0 overflow-hidden ring-offset-background transition-all hover:ring-2 hover:ring-primary/20">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={`https://picsum.photos/seed/${user.uid}/100/100`} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 mt-2 rounded-xl shadow-xl" align="end">
                <DropdownMenuLabel className="font-headline font-bold">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/me" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> Profile Details
                  </Link>
                </DropdownMenuItem>
                {role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/settings" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" /> System Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout} 
                  className="text-destructive focus:text-destructive cursor-pointer font-bold"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button asChild className="rounded-xl px-6 font-bold shadow-lg shadow-primary/20">
            <Link href="/login">Sign In</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
