'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  limit
} from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { 
  setMemberInitialPasswordAction,
  registerMemberSelfAction
} from '@/lib/finance-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Wallet, 
  Loader2, 
  LogIn, 
  Mail, 
  Lock, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Clock, 
  UserPlus, 
  RefreshCw, 
  User, 
  Phone 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

export default function LoginPage() {
  const { settings: appSettings } = useSettings();
  const appName = appSettings.appName?.trim() || 'Ikimina App';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [step, setStep] = useState<'email' | 'password' | 'set-password' | 'register' | 'pending-activation'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [memberDocId, setMemberDocId] = useState<string | null>(null);
  const [existingMemberName, setExistingMemberName] = useState<string | null>(null);

  // Forgot Password State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const auth = useAuth();
  const { user: currentUser, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { settings } = useSettings();
  const infrastructureBranding = settings.infrastructureBranding?.trim() || 'Secure Infrastructure Provided by ORVEXI';

  // If already authenticated with an active account, navigate to dashboard
  useEffect(() => {
    let isCancelled = false;
    const verifyActiveSession = async () => {
      if (!userLoading && currentUser && step === 'email') {
        try {
          const userDocSnap = await getDoc(doc(firestore, 'users', currentUser.uid));
          if (!isCancelled) {
            if (userDocSnap.exists() && userDocSnap.data().status === 'active') {
              router.replace('/dashboard');
            } else if (userDocSnap.exists() && userDocSnap.data().status !== 'active') {
              await signOut(auth);
              setEmail(currentUser.email || '');
              setStep('pending-activation');
            }
          }
        } catch (e) {
          console.warn('Session verification check:', e);
        }
      }
    };
    verifyActiveSession();
    return () => { isCancelled = true; };
  }, [currentUser, userLoading, step, router, auth, firestore]);

  const handleCheckEmail = async (e?: React.FormEvent, targetEmail?: string) => {
    if (e) e.preventDefault();
    const emailToCheck = (targetEmail || email).trim().toLowerCase();
    if (!emailToCheck) return;
    
    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'You are currently disconnected from the internet. Please connect and try again.',
      });
    }

    setIsLoading(true);
    const normalizedEmail = emailToCheck;
    try {
      const q = query(
        collection(firestore, 'users'), 
        where('email', '==', normalizedEmail), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({ 
          variant: "destructive",
          title: "Account Not Found", 
          description: "Your email is not registered in the system. Please contact an administrator to create your membership profile." 
        });
        return;
      }

      const memberDoc = querySnapshot.docs[0];
      const memberData = memberDoc.data();
      setMemberDocId(memberDoc.id);
      setEmail(normalizedEmail);
      if (memberData.name) {
        setExistingMemberName(memberData.name);
      }

      if (memberData.status === 'active') {
        setStep('password');
      } else {
        if (!memberData.passwordSet) {
          setStep('set-password');
          toast({ 
            title: "Welcome!", 
            description: "Your membership profile was created by the administrator. Please set your account password." 
          });
        } else {
          setStep('pending-activation');
        }
      }
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Lookup Failed', 
        description: parsed.message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      const cleanEmail = emailParam.trim().toLowerCase();
      setEmail(cleanEmail);
      handleCheckEmail(undefined, cleanEmail);
    }
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Passwords do not match.' });
    }

    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'Cannot set password while offline. Please connect to the internet.',
      });
    }

    setIsLoading(true);
    try {
      const res = await setMemberInitialPasswordAction({
        email: email.trim().toLowerCase(),
        password,
        memberDocId: memberDocId || undefined
      });

      if (res.isActive) {
        toast({ title: 'Password Configured', description: 'Your password is set and your account is active. Please sign in.' });
        setStep('password');
      } else {
        toast({ 
          title: 'Password Configured', 
          description: 'Your password is saved. Your membership is now awaiting administrator activation.' 
        });
        setStep('pending-activation');
      }
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Failed to Set Password', 
        description: parsed.message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'You are currently disconnected from the internet. Please check your connection before signing in.',
      });
    }
    setIsLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      
      // Verify account activation status in Firestore
      const userDocSnap = await getDoc(doc(firestore, 'users', cred.user.uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (userData.status !== 'active') {
          await signOut(auth);
          setStep('pending-activation');
          toast({
            variant: 'destructive',
            title: 'Account Pending Activation',
            description: 'Your password is verified, but your membership is awaiting administrator activation.',
          });
          return;
        }
      }
      
      router.push('/dashboard');
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Sign In Failed', 
        description: parsed.message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!targetEmail) {
      return toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your registered email address.',
      });
    }

    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'Cannot send password reset email while offline. Please connect to the internet.',
      });
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      toast({
        title: 'Password Reset Email Sent',
        description: `We've sent a password reset link to ${targetEmail}. Please check your inbox or spam folder.`,
      });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Reset Failed', 
        description: parsed.message 
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl border-primary/10">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
              <Wallet className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-headline font-bold" suppressHydrationWarning>{appName}</CardTitle>
          <CardDescription>
            {step === 'email' && "Enter your email to sign in or register"}
            {step === 'password' && "Enter your password to sign in"}
            {step === 'set-password' && `Welcome ${existingMemberName || ''}! Set your account password`}
            {step === 'register' && "Create your new membership account"}
            {step === 'pending-activation' && "Account Pending Administrator Activation"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* STEP 1: EMAIL LOOKUP */}
          {step === 'email' && (
            <form onSubmit={handleCheckEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    className="pl-10 h-11 rounded-xl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button className="w-full h-11 rounded-xl font-bold" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                Continue
              </Button>
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email.trim());
                    setIsResetDialogOpen(true);
                  }}
                  className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors hover:underline focus:outline-none"
                >
                  Forgot your password?
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: PASSWORD SIGN IN */}
          {step === 'password' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} disabled className="bg-muted h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email.trim());
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
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="pl-10 pr-10 h-11 rounded-xl"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
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
              <Button className="w-full h-11 rounded-xl font-bold" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                Sign In
              </Button>
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPassword('');
                    setStep('email');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SET PASSWORD FOR PRE-REGISTERED MEMBER */}
          {step === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex gap-2.5 items-start text-left">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground">Welcome to the scheme!</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Your member profile has been registered. Choose a secure password to complete your account setup.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="set-new-password">Choose Password</Label>
                <div className="relative">
                  <Input
                    id="set-new-password"
                    type={showPassword ? "text" : "password"}
                    className="pr-10 h-11 rounded-xl"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
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

              <div className="space-y-2">
                <Label htmlFor="set-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="set-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="pr-10 h-11 rounded-xl"
                    placeholder="Re-type password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2 h-5 w-5" />}
                Save Password & Continue
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPassword('');
                    setConfirmPassword('');
                    setStep('email');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  Back to email
                </button>
              </div>
            </form>
          )}

          {/* STEP 5: PENDING ADMINISTRATOR ACTIVATION SCREEN */}
          {step === 'pending-activation' && (
            <div className="space-y-5 text-left">
              <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-2xl flex gap-3.5 items-start">
                <Clock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">Awaiting Administrator Activation</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your account credentials for <strong className="text-foreground">{email}</strong> are successfully configured. 
                    Your membership is awaiting administrator approval before login access is granted.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-muted/60 rounded-2xl border border-border/80 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  What happens next?
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Your scheme administrator activates new member profiles from the admin panel.</li>
                  <li>Zero email links are required—once activated by the admin, you can log in immediately.</li>
                  <li>Click <strong>&quot;Check Activation Status&quot;</strong> below anytime to verify your status.</li>
                </ul>
              </div>

              <Button 
                className="w-full h-11 rounded-xl font-bold" 
                onClick={() => handleCheckEmail()} 
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Check Activation Status
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPassword('');
                    setConfirmPassword('');
                    setStep('email');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  Sign in with a different email
                </button>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t py-3 px-4">
          <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-bold leading-none" suppressHydrationWarning>
            {infrastructureBranding}
          </p>
        </CardFooter>
      </Card>

      {/* Forgot Password Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader className="space-y-2">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1 border border-primary/20">
              <KeyRound className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-xl font-bold">Reset Your Password</DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              Enter your registered email address and we will send you a secure link to reset your account password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSendPasswordReset} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@example.com"
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
