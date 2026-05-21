'use client';

import Link from 'next/link';
import { Home, Users, Wallet, Flag, Settings, LogOut } from 'lucide-react';
import { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/auth/use-user';
import { getAuth, signOut } from 'firebase/auth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();

  const handleLogout = async () => {
    await signOut(getAuth());
  };

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr] bg-black">
      {/* Sidebar - Black Background */}
      <aside className="hidden border-r border-white/10 bg-black lg:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-16 items-center border-b border-white/10 px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-white">
              <Wallet className="h-6 w-6 text-primary shadow-lg shadow-primary/20" />
              <span className="font-headline text-xl">Ikimina Admin</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-4">
            <nav className="grid items-start px-4 text-sm font-bold gap-1">
              <Link href="/admin" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/60 transition-all hover:bg-white/5 hover:text-white">
                <Home className="h-4 w-4" />
                Main Dashboard
              </Link>
              <Link href="/members" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/60 transition-all hover:bg-white/5 hover:text-white">
                <Users className="h-4 w-4" />
                Members
              </Link>
              <Link href="/contributions" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/60 transition-all hover:bg-white/5 hover:text-white">
                <Wallet className="h-4 w-4" />
                Contributions
              </Link>
               <Link href="/reports" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/60 transition-all hover:bg-white/5 hover:text-white">
                <Flag className="h-4 w-4" />
                Reports
              </Link>
              <Link href="/admin/settings" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/60 transition-all hover:bg-white/5 hover:text-white">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </aside>

      <div className="flex flex-col overflow-hidden">
        {/* Header - Black Background */}
        <header className="flex h-16 items-center gap-4 border-b border-white/10 bg-black px-6 shrink-0">
          <div className="w-full flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/100/100`} />
                    <AvatarFallback className="bg-primary/20 text-primary">A</AvatarFallback>
                </Avatar>
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-[10px]">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = '/'}>View Site</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive font-bold">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Workspace - Black Background with white content spacing */}
        <main className="flex-1 overflow-auto bg-black p-4 md:p-6">
          <div className="rounded-[10px] min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
