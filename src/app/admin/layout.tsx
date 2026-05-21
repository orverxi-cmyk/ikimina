'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Users, Wallet, Flag, Settings, LogOut, ShieldCheck, ChevronLeft } from 'lucide-react';
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
  const router = useRouter();

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

  // In admin, we might want back buttons on mobile for any sub-page
  const isRootLevel = pathname === '/admin';

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      {/* Global Full-Width Header - Standardized with main app */}
      <header className="grid grid-cols-3 h-16 w-full items-center border-b border-white/10 bg-[#050505] px-4 md:px-10 sticky top-0 z-40 text-white shrink-0 shadow-xl backdrop-blur-sm">
        {/* Left: Back Button (Mobile) or Profile Avatar */}
        <div className="flex items-center justify-start">
          {!isRootLevel ? (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => router.back()} 
              className="md:hidden rounded-full hover:bg-white/10 -ml-2"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          ) : null}

          <div className={!isRootLevel ? "hidden md:block" : "block"}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                  <Avatar className="h-9 w-9 border border-white/10">
                    <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/100/100`} />
                    <AvatarFallback className="bg-primary/20 text-primary">A</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 rounded-[10px]">
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
        </div>

        {/* Center: Branding - Standardized Centering */}
        <div className="flex items-center justify-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20">
            <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
          </div>
          <span className="font-headline text-sm md:text-lg font-bold tracking-tight text-white uppercase whitespace-nowrap">
            Ikimina App
          </span>
        </div>

        {/* Right: Role Status */}
        <div className="flex items-center justify-end">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <ShieldCheck className="h-3 w-3" />
            ADMIN ACCESS
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="sm:hidden text-destructive">
             <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Workspace Container with spacing */}
        <div className="flex flex-1 w-full p-4 gap-4 overflow-hidden">
          {/* Floating Sidebar */}
          <aside className="hidden md:flex flex-col w-64 bg-black p-6 space-y-8 rounded-[10px] border border-white/10 shrink-0 shadow-2xl">
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
          
          {/* Main Application Window */}
          <main className="flex-1 overflow-auto rounded-[10px] relative">
            <div className="min-h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
