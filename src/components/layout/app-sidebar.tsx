'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Flame, MessageSquare, User, PlusSquare, Music, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { getAuth, signOut } from 'firebase/auth';

function SidebarAuth() {
  const { user, loading } = useUser();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = async () => {
    const auth = getAuth();
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };
  
  if (!isClient || loading) {
    return (
       <Button variant="outline" disabled className="w-full justify-start">
        <LogIn className="mr-2 h-5 w-5" />
        Login
      </Button>
    );
  }

  if (user) {
    return (
      <Button variant="outline" onClick={handleLogout} className="w-full justify-start">
        <LogOut className="mr-2 h-5 w-5" />
        Logout
      </Button>
    );
  }

  return (
    <Link href="/login" passHref>
      <Button variant="outline" className="w-full justify-start">
        <LogIn className="mr-2 h-5 w-5" />
        Login
      </Button>
    </Link>
  );
}


export function AppSidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const menuItems = [
    { href: '/', label: 'For You', icon: Home },
    { href: '/popular', label: 'Popular', icon: Flame },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/profile/me', label: 'Profile', icon: User },
    { href: '/upload', label: 'Create', icon: PlusSquare },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-card/20 p-4 space-y-4">
      <Link href="/" className="flex items-center gap-2 px-2">
        <Music className="h-8 w-8 text-primary" />
        <span className="font-headline text-2xl font-bold">LopRok</span>
      </Link>
      
      <nav className="flex-1 flex flex-col space-y-2">
        {menuItems.map((item) => {
          const isActive = isClient && ((pathname.startsWith(item.href) && item.href !== '/') || pathname === item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-lg font-medium transition-all hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-6 w-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <SidebarAuth />
      </div>
    </aside>
  );
}
