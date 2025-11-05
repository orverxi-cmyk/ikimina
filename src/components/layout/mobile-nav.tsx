'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Flame, User, Video, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/popular', label: 'Popular', icon: Flame },
    { href: '/messages', label: 'Inbox', icon: MessageSquare },
    { href: '/profile/me', label: 'Me', icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-50">
      <nav className="flex justify-around items-center h-16">
        {menuItems.slice(0,2).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full',
              pathname === item.href ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-xs mt-1">{item.label}</span>
          </Link>
        ))}
        
        <div className="w-full" /> 

        {menuItems.slice(2).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full',
              pathname === item.href ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-xs mt-1">{item.label}</span>
          </Link>
        ))}

        {/* Special button for Record */}
        <Link href="/record" className="absolute left-1/2 -translate-x-1/2 -top-5">
          <div className="flex items-center justify-center bg-primary rounded-2xl w-16 h-10 shadow-lg shadow-primary/30 border-4 border-background">
            <Video className="h-5 w-5 text-primary-foreground" />
          </div>
        </Link>
      </nav>
    </div>
  );
}
