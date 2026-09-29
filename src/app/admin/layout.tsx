'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  Users, 
  Wallet, 
  Flag, 
  Settings, 
  LogOut, 
  ShieldCheck, 
  ChevronLeft, 
  Mail, 
  Lock, 
  Loader2, 
  ArrowRight, 
  ShieldAlert,
  Eye,
  EyeOff
} from 'lucide-react';
import { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase/auth/use-user';
import { useAuth, useFirestore } from '@/firebase/provider';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading: userLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [adminEmail, setAdminEmail] = useState('tharushyamagara@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Fetch Firestore user doc
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: docLoading } = useDoc(userRef);

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) return;

    setIsLoggingIn(true);
    const normalizedEmail = adminEmail.trim().toLowerCase();

    try {
      // Standard, secure Firebase Authentication
      await signInWithEmailAndPassword(auth, normalizedEmail, adminPassword);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: "Invalid email or password.",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Loading state
  if (userLoading || (user && docLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // 1. Not Authenticated: Render Admin Login Form on /admin
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-2xl border-primary/20">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-3.5 rounded-2xl text-primary border border-primary/20 shadow-md">
                <ShieldCheck className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-headline font-bold">Admin Console</CardTitle>
            <CardDescription>
              Sign in with your Administrator credentials
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Administrator Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@example.com"
                    className="pl-10 h-11 rounded-xl"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-11 rounded-xl"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 rounded-xl font-bold shadow-lg" 
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-5 w-5" />
                )}
                Sign In to Admin Console
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t p-4">
            <Link href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Looking for member login? Go to Member Portal →
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 2. Authenticated but NOT an Admin: Access Denied Screen
  const isAdmin = userData?.role === 'admin';
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-2xl border-destructive/20 text-center">
          <CardHeader className="space-y-2">
            <div className="flex justify-center mb-2">
              <div className="bg-destructive/10 p-3 rounded-full">
                <ShieldAlert className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl font-headline font-bold text-destructive">
              Access Restricted
            </CardTitle>
            <CardDescription>
              The account <strong>{user.email}</strong> does not have administrator privileges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Please sign in with an authorized administrator account or return to the main dashboard.
            </p>
            <Button variant="outline" onClick={() => router.push('/')} className="w-full h-11 rounded-xl">
              Return to Member Portal
            </Button>
            <Button variant="destructive" onClick={handleLogout} className="w-full h-11 rounded-xl font-bold">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Authenticated as Admin: Full Admin Console Layout
  const menuItems = [
    { href: '/admin', label: 'Main Dashboard', icon: Home },
    { href: '/members', label: 'Members', icon: Users },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/reports', label: 'Reports', icon: Flag },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  const isRootLevel = pathname === '/admin';

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Global Full-Width Header */}
      <header className="grid grid-cols-3 h-16 w-full items-center border-b border-white/10 bg-primary px-4 md:px-10 sticky top-0 z-[60] shrink-0 shadow-lg">
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

          <div className={!isRootLevel ? "hidden md:block" : "block"}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 text-white">
                  <Avatar className="h-9 w-9 border border-white/20">
                    <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/100/100`} />
                    <AvatarFallback className="bg-white/20 text-white font-bold">
                      {userData?.name?.charAt(0) || user.email?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 rounded-[10px]">
                <DropdownMenuLabel>Administrative Access</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/')}>Exit to Member Portal</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive font-bold">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <div className="bg-white p-1.5 rounded-lg shadow-lg">
            <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <span className="font-headline text-sm md:text-lg font-bold tracking-tight text-white uppercase whitespace-nowrap">
            Ikimina App
          </span>
        </div>

        <div className="flex items-center justify-end">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-white bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
            <ShieldCheck className="h-3 w-3" />
            ADMIN ACCESS
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="sm:hidden text-white hover:bg-white/10">
             <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex flex-1 w-full p-4 gap-4 overflow-hidden">
          <aside className="hidden md:flex flex-col w-64 bg-background p-6 space-y-8 rounded-[10px] border border-border shrink-0 shadow-sm">
            <div className="flex flex-col gap-1 px-4 py-3 border-b border-border">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Internal System</h2>
              <span className="text-sm font-bold text-primary flex items-center gap-2">
                <ShieldCheck className="h-3 w-3" /> Administrator Console
              </span>
            </div>

            <nav className="flex-1 space-y-1">
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
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
          
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
