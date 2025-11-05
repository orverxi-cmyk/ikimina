'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Flame, MessageSquare, User, Upload, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'For You', icon: Home },
    { href: '/popular', label: 'Popular', icon: Flame },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/profile/me', label: 'Profile', icon: User },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-card/20 p-4 space-y-8">
      <Link href="/" className="flex items-center gap-2 px-2">
        <Music className="h-8 w-8 text-primary" />
        <span className="font-headline text-2xl font-bold">LopRok</span>
      </Link>
      
      <nav className="flex-1 flex flex-col space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-lg font-medium transition-all hover:bg-accent hover:text-accent-foreground',
              (pathname.startsWith(item.href) && item.href !== '/') || pathname === item.href
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-6 w-6" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto">
        <Link href="/upload" passHref>
            <Button size="lg" className="w-full text-lg font-headline">
                <Upload className="mr-2 h-5 w-5" />
                Upload
            </Button>
        </Link>
      </div>
    </aside>
  );
}
