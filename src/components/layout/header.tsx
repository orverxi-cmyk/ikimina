'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, collection, query, where, orderBy, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useMemo } from 'react';
import { User, LogOut, LogIn, Wallet, ChevronLeft, UserX, Landmark, Bell, CheckCheck } from 'lucide-react';
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

const cleanNotificationText = (text?: string) => {
  if (!text) return '';
  return text
    .replace(/Action Required:\s*Confirm Bulk Loan Application/gi, 'Action Required: Confirm Loan Balance')
    .replace(/Bulk Loan Confirmed by Member/gi, 'Loan Balance Confirmed by Member')
    .replace(/\(Computerized bulk loan record\)/gi, '(Preexisting loan facility)')
    .replace(/\(Institutional bulk loan\)/gi, '(Preexisting loan facility)')
    .replace(/their bulk loan of/gi, 'their loan balance of')
    .replace(/bulk loan application/gi, 'loan balance');
};

export function Header() {
  const { user } = useUser();
  const { settings } = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const notifQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'notifications'),
      where('recipientId', '==', user.uid)
    );
  }, [user, firestore]);

  const { data: notifSnap } = useCollection(notifQuery);

  const notifications = useMemo(() => {
    if (!notifSnap) return [];
    const list = notifSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    return list.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
  }, [notifSnap]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notif: any) => {
    if (!notif.read) {
      try {
        await updateDoc(doc(firestore, 'notifications', notif.id), {
          read: true,
          readAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Failed to mark notification read:', e);
      }
    }
    if (notif.actionUrl) {
      router.push(notif.actionUrl);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      try {
        await updateDoc(doc(firestore, 'notifications', n.id), {
          read: true,
          readAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Failed to mark notification read:', e);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  // Define top-level routes that don't need a back button on mobile
  const isRootLevel = ['/dashboard', '/', '/messages', '/profile/me', '/more'].includes(pathname);

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
                  <p className="truncate text-foreground">{userData?.name || 'Account'}</p>
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
                    <span>Savings</span>
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
          <>
            {/* Real-time Notification Bell Tray */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="relative p-2 rounded-full text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
                  title="Notifications & Operational Alerts"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold text-white shadow-sm animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 rounded-2xl shadow-2xl bg-card border border-border z-[70] overflow-hidden">
                <div className="p-3 bg-muted/60 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-headline">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs font-semibold">No notifications</p>
                      <p className="text-[11px]">All caught up with latest operations.</p>
                    </div>
                  ) : (
                    notifications.slice(0, 7).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-3 text-left transition-colors cursor-pointer hover:bg-muted/50 flex gap-2.5 items-start ${
                          !n.read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.read ? 'bg-primary' : 'bg-transparent'}`} />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-xs font-bold text-foreground leading-snug truncate">
                            {cleanNotificationText(n.title)}
                          </p>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {cleanNotificationText(n.message)}
                          </p>
                          {n.actionUrl && (
                            <span className="inline-block text-[10px] font-semibold text-primary pt-0.5">
                              View details &rarr;
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-muted/30 border-t text-center">
                  <Link
                    href="/messages"
                    className="text-xs font-bold text-primary hover:underline inline-block w-full py-1"
                  >
                    Go to Full Notification Inbox
                  </Link>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className="rounded-xl font-bold text-white hover:bg-white/10 h-9 px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Sign Out</span>
            </Button>
          </>
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
