'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, User, MessageSquare, MoreHorizontal, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  const leftItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/messages', label: 'Inbox', icon: MessageSquare },
  ];

  const rightItems = [
    { href: '/profile/me', label: 'Profile', icon: User },
    { href: '/more', label: 'More', icon: MoreHorizontal },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
      <nav className="flex justify-around items-center h-16 px-2">
        {leftItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full transition-colors',
              pathname === item.href ? 'text-primary' : 'text-gray-400'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-bold uppercase tracking-tighter">{item.label}</span>
          </Link>
        ))}
        
        {/* Streamlined "Apply" Action in the Center */}
        <div className="relative w-full h-full flex items-center justify-center">
          <Link 
            href="/loans/apply" 
            className="absolute -top-6 bg-primary rounded-2xl w-14 h-14 shadow-lg shadow-primary/30 border-4 border-black flex flex-col items-center justify-center text-primary-foreground group active:scale-95 transition-transform"
          >
            <HandCoins className="h-6 w-6" />
            <span className="text-[8px] font-bold uppercase mt-0.5">Apply</span>
          </Link>
        </div>

        {rightItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full transition-colors',
              pathname === item.href ? 'text-primary' : 'text-gray-400'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-bold uppercase tracking-tighter">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
