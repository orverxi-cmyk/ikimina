'use client';

import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const role = userData?.role || 'member';

  return (
    <header className="hidden md:flex h-16 items-center justify-between border-b bg-card px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {role === 'admin' ? 'Administrator Console' : 'Member Portal'}
        </h2>
      </div>

      <div className="flex items-center gap-6">
        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right hidden lg:block">
              <p className="text-sm font-bold leading-none text-foreground">{userData?.name || user.email}</p>
              <p className="text-[9px] text-primary font-bold uppercase mt-1.5 tracking-wider">{role}</p>
            </div>
            
            <div className="relative h-10 w-10 rounded-full border-2 border-primary/20 p-0 overflow-hidden shadow-sm">
              <Avatar className="h-full w-full">
                <AvatarImage src={`https://picsum.photos/seed/${user.uid}/100/100`} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
