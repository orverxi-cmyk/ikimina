'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, MoreHorizontal, HandCoins, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  const leftItems = [
    { href: '/', label: 'Account', icon: LayoutDashboard },
    { href: '/contributions', label: 'Savings', icon: Wallet },
  ];

  const rightItems = [
    { href: '/messages', label: 'Inbox', icon: MessageSquare },
    { href: '/more', label: 'More', icon: MoreHorizontal },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-[60] shadow-lg">
      <nav className="flex justify-around items-center h-16 px-2">
        {leftItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
              <span className={cn(
                'text-[10px] mt-1 tracking-tight text-center leading-tight truncate max-w-full px-0.5',
                isActive ? 'font-semibold text-primary' : 'font-normal'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
        
        {/* Streamlined "Apply" Action in the Center */}
        <div className="relative w-full h-full flex items-center justify-center">
          <Link 
            href="/loans/apply" 
            className="absolute -top-5 bg-primary rounded-2xl w-12 h-12 shadow-md shadow-primary/25 border-4 border-background flex flex-col items-center justify-center text-primary-foreground group active:scale-95 transition-transform"
            title="Apply for Loan"
          >
            <HandCoins className="h-5 w-5" />
            <span className="text-[9px] font-semibold mt-0.5">Apply</span>
          </Link>
        </div>

        {rightItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
              <span className={cn(
                'text-[10px] mt-1 tracking-tight text-center leading-tight truncate max-w-full px-0.5',
                isActive ? 'font-semibold text-primary' : 'font-normal'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
