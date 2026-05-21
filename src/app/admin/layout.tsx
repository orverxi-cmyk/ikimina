'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Wallet, Flag, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/auth/use-user';
import { getAuth, signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const pathname = usePathname();

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  const menuItems = [
    { href: '/admin', label: 'Main Dashboard', icon: Home },
    { href: '/members', label: 'Members', icon: Users },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/reports', label: 'Reports', icon: Flag },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      {/* Global Full-Width Header */}
      <header className="h-16 w-full flex items-center justify-between border-b border-white/10 bg-black px-4 md:px-10 shrink-0 shadow-lg text-white">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20">
            <Wallet className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
          </div>
          <span className="font-headline text-lg md:text-xl font-bold tracking-tight">
            Ikimina App
          </span>
        </div>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/100/100`} />
                  <AvatarFallback className="bg-primary/20 text-primary">A</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-[10px]">
              <DropdownMenuLabel>Administrative Access</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = '/'}>Exit Console</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive font-bold">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative p-4 gap-4">
        {/* Floating Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-black p-6 space-y-8 rounded-[10px] border border-white/10 shrink-0">
          <div className="flex flex-col gap-1 px-4 py-3 border-b border-white/10">
            <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Internal System</h2>
            <span className="text-xs font-bold text-primary flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" /> Administrator Console
            </span>
          </div>

          <nav className="flex-1 space-y-2">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-bold transition-all',
                    isActive 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        
        {/* Main Content Card - Floating on Black Background */}
        <main className="flex-1 overflow-auto rounded-[10px] bg-black">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
