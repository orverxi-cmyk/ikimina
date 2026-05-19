'use client';

import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, LogOut, Settings, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuth, signOut } from 'firebase/auth';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const role = userData?.role || 'member';

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  return (
    <header className="hidden md:flex h-16 items-center justify-between border-b bg-card px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {role === 'admin' ? 'Administrator Console' : 'Member Portal'}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-4">
            <div className="text-right hidden lg:block">
              <p className="text-sm font-bold leading-none text-foreground">{userData?.name || user.email}</p>
              <p className="text-[9px] text-primary font-bold uppercase mt-1.5 tracking-wider">{role}</p>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative h-10 w-10 rounded-full border-2 border-primary/20 p-0 overflow-hidden shadow-sm hover:border-primary/50 transition-colors">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={`https://picsum.photos/seed/${user.uid}/100/100`} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-xl border-primary/10">
                <DropdownMenuLabel className="font-headline">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/me" className="cursor-pointer flex items-center gap-2">
                    <User className="h-4 w-4" /> Profile Summary
                  </Link>
                </DropdownMenuItem>
                {role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/settings" className="cursor-pointer flex items-center gap-2">
                      <Settings className="h-4 w-4" /> System Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2 font-bold">
                  <LogOut className="h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link href="/login">
            <Button size="sm" className="rounded-xl font-bold">
              <LogIn className="mr-2 h-4 w-4" /> Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
