'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, MoreHorizontal, HandCoins, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  const leftItems = [
    { href: '/dashboard', label: 'Account', icon: LayoutDashboard },
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
          const isActive = pathname === item.href || (item.href === '/dashboard' && pathname === '/');
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
            className={cn(
              "absolute -top-4 bg-primary rounded-2xl w-[52px] h-[52px] shadow-lg shadow-primary/25 border-[3px] border-background flex flex-col items-center justify-center text-primary-foreground group active:scale-95 transition-all p-1",
              pathname === '/loans/apply' && "ring-2 ring-primary ring-offset-2 ring-offset-background"
            )}
            title="Apply for Loan"
          >
            <HandCoins className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="text-[9px] font-bold tracking-tight leading-none mt-1 select-none">Apply</span>
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
