'use client';

import { useState, useEffect } from 'react';
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
  EyeOff,
  Receipt,
  TrendingUp,
  LayoutDashboard,
  Landmark,
  HandCoins,
  FileSpreadsheet,
  FileText
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
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase/auth/use-user';
import { useAuth, useFirestore } from '@/firebase/provider';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/settings-context';
import { AppFooter } from '@/components/layout/app-footer';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

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

  // Admin Forgot Password state
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Fetch Firestore user doc
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: docLoading } = useDoc(userRef);

  const { settings } = useSettings();
  const infrastructureBranding = settings.infrastructureBranding?.trim() || 'Secure Infrastructure Provided by ORVEXI';

  // Cached role logic to prevent role loss or flicker during page navigation
  const [cachedRole, setCachedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const effectiveRole = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before signing in as administrator.",
      });
    }

    setIsLoggingIn(true);
    const normalizedEmail = adminEmail.trim().toLowerCase();

    try {
      // Standard, secure Firebase Authentication
      await signInWithEmailAndPassword(auth, normalizedEmail, adminPassword);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({
        variant: "destructive",
        title: parsed.title || "Authentication Failed",
        description: parsed.message,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!targetEmail) {
      return toast({
        variant: "destructive",
        title: "Email Required",
        description: "Please enter your administrator email address.",
      });
    }

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "Cannot send password reset email while offline. Please connect to the internet.",
      });
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      toast({
        title: "Password Reset Email Sent",
        description: `We've sent a password reset link to ${targetEmail}. Please check your inbox or spam folder.`,
      });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({
        variant: "destructive",
        title: parsed.title || "Reset Failed",
        description: parsed.message,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  // Loading state: only block if we have no cached role and no authoritative role yet
  if (userLoading || (user && docLoading && !cachedRole && !isPrimaryAdmin)) {
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="adminPassword">Password</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(adminEmail.trim());
                      setIsResetDialogOpen(true);
                    }}
                    className="text-xs text-primary font-medium hover:underline focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
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

          <CardFooter className="flex flex-col items-center justify-center border-t p-4 gap-2">
            <Link href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Looking for member login? Go to Member Portal →
            </Link>
            <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-bold leading-none">
              {infrastructureBranding}
            </p>
          </CardFooter>
        </Card>

        {/* Admin Password Reset Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1 border border-primary/20">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <DialogTitle className="text-center text-xl font-bold">Reset Administrator Password</DialogTitle>
              <DialogDescription className="text-center text-xs text-muted-foreground">
                Enter your administrator email address below. We'll send you a secure link to reset your account password.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAdminPasswordReset} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="admin-reset-email">Administrator Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="admin-reset-email"
                    type="email"
                    placeholder="admin@example.com"
                    className="pl-10 h-11 rounded-xl"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-1/2 h-11 rounded-xl"
                  onClick={() => setIsResetDialogOpen(false)}
                  disabled={isSendingReset}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="w-full sm:w-1/2 h-11 rounded-xl font-bold"
                  disabled={isSendingReset}
                >
                  {isSendingReset ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 2. Authenticated but NOT an Admin, Reviewer, Accountant, or Auditor: Access Denied Screen
  const hasAccess = isPrimaryAdmin || effectiveRole === 'admin' || effectiveRole === 'accountant' || effectiveRole === 'reviewer' || effectiveRole === 'management' || effectiveRole === 'auditor';
  if (!hasAccess) {
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
              The account <strong>{user.email}</strong> does not have administrator, auditor, reviewer, or accountant privileges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Please sign in with an authorized account or return to the main dashboard.
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

  // 3. Authenticated: Console Layout
  const userRole = effectiveRole;
  const isSuperAdmin = userRole === 'admin';
  const isAccountant = userRole === 'accountant';
  const isReviewer = userRole === 'reviewer' || userRole === 'management';
  const isAuditor = userRole === 'auditor';

  const batchLabel = isSuperAdmin ? 'Batch Approvals' : isAccountant ? 'Batch Upload' : 'Review Batches';

  const adminMenuItems = [
    { href: '/admin', label: 'Dashboard', icon: Home },
    { href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck },
    ...(isAuditor ? [
      { href: '/admin/audit-logs', label: 'Audit Trail & PDF Report', icon: ShieldCheck },
      { href: '/reports', label: 'Financial Reports', icon: FileText },
    ] : [
      ...(isSuperAdmin || isAccountant ? [
        { href: '/admin/expenses', label: 'Operating Expenses', icon: Receipt },
      ] : []),
      { href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck },
      ...(isSuperAdmin ? [
        { href: '/members', label: 'Members Directory', icon: Users },
        { href: '/reports', label: 'Financial Reports', icon: FileText },
        { href: '/admin/settings', label: 'Settings', icon: Settings },
      ] : [
        { href: '/reports', label: 'Financial Reports', icon: FileText },
      ])
    ])
  ];

  const memberMenuItems = [
    { href: '/', label: 'My Account', icon: LayoutDashboard },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/loans', label: 'Loan Portfolio', icon: Landmark },
    { href: '/loans/apply', label: 'Apply for Loan', icon: HandCoins },
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
                    <AvatarImage src={userData?.photoURL || user?.photoURL || `https://picsum.photos/seed/${user?.uid}/100/100`} />
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
            {settings.appName?.trim() || 'Ikimina App'}
          </span>
        </div>

        <div className="flex items-center justify-end">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-white bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
            <ShieldCheck className="h-3 w-3" />
            {userRole.toUpperCase()} ACCESS
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="sm:hidden text-white hover:bg-white/10">
             <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex flex-1 w-full p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
          <aside className="hidden md:flex flex-col w-64 bg-background rounded-[10px] border border-border shrink-0 shadow-sm overflow-hidden">
            {/* Separate Header with Blue Background and Bottom Separator */}
            <div className="bg-blue-600 px-5 py-3.5 border-b border-blue-700/60 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-white shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                {isAuditor 
                  ? 'Auditor Console' 
                  : isAccountant 
                  ? 'Accountant Console' 
                  : isReviewer 
                  ? 'Reviewer Console' 
                  : 'Administrator Console'}
              </h2>
            </div>

            <div className="flex-1 flex flex-col p-4 sm:p-5 space-y-6 overflow-y-auto">
              <nav className="flex-1 space-y-4">
                {/* Administrative Tools Group */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                    {isSuperAdmin ? 'Management & Controls' : 'Administrative Tools'}
                  </p>
                  {adminMenuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all duration-200',
                          isActive 
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.01]' 
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                {/* Member Services Group */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-1.5 pt-2 border-t border-border/60">
                    Member Services
                  </p>
                  {memberMenuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all duration-200',
                          isActive 
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.01]' 
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>
          </aside>
          
          <main className="flex-1 overflow-y-auto overflow-x-hidden rounded-[10px] relative min-w-0 flex flex-col">
            <div className="flex-1 min-w-0 w-full">
              {children}
            </div>
            <AppFooter />
          </main>
        </div>
      </div>
    </div>
  );
}
