'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
  sendSignInLinkToEmail,
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
import { activateMemberAccountAction } from '@/lib/finance-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Wallet, Loader2, LogIn, Mail, Lock, ArrowRight, ShieldCheck, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [step, setStep] = useState<'email' | 'password' | 'pending-activation' | 'set-password'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [memberDocId, setMemberDocId] = useState<string | null>(null);

  // Forgot Password State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const handleAuthLink = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let emailForLink = window.localStorage.getItem('emailForSignIn');
        if (!emailForLink) {
          emailForLink = window.prompt('Please provide your email for confirmation');
        }

        if (emailForLink) {
          setIsLoading(true);
          try {
            const result = await signInWithEmailLink(auth, emailForLink.toLowerCase(), window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            
            // 1. Check if user already has a doc matching their UID
            const userDocByUid = await getDoc(doc(firestore, 'users', result.user.uid));
            
            if (userDocByUid.exists()) {
              setMemberDocId(result.user.uid);
              if (userDocByUid.data().status === 'pending') {
                setStep('set-password');
              } else {
                router.push('/');
              }
            } else {
              // 2. Lookup by email to find the invitation doc (which has a random ID)
              const q = query(
                collection(firestore, 'users'), 
                where('email', '==', emailForLink.toLowerCase()), 
                limit(1)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                setMemberDocId(snap.docs[0].id);
                setStep('set-password');
              } else {
                toast({ title: "Profile Missing", description: "You are logged in, but we couldn't find your member profile." });
                router.push('/');
              }
            }
          } catch (error: any) {
            const parsed = parseAppError(error);
            toast({ 
              variant: 'destructive', 
              title: parsed.title || 'Activation Error', 
              description: parsed.message 
            });
          } finally {
            setIsLoading(false);
          }
        }
      }
    };

    handleAuthLink();
  }, [auth, firestore, router, toast]);

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'You are currently disconnected from the internet. Please connect and try again.',
      });
    }

    setIsLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const q = query(
        collection(firestore, 'users'), 
        where('email', '==', normalizedEmail), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        if (isBrowserOffline()) {
          throw new Error('Connection lost while reaching the database. Please check your internet connection.');
        }
        throw new Error('This email address is not registered in our system. Please check your spelling or contact your scheme administrator.');
      }

      const memberData = querySnapshot.docs[0].data();
      setMemberDocId(querySnapshot.docs[0].id);
      setEmail(normalizedEmail);

      if (memberData.status === 'active') {
        setStep('password');
      } else {
        setStep('pending-activation');
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

  const handleSendActivationLink = async () => {
    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'Cannot send activation email while offline. Please connect to the internet.',
      });
    }
    setIsLoading(true);
    try {
      const actionCodeSettings = {
        url: window.location.origin + '/login',
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email.toLowerCase(), actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email.toLowerCase());
      toast({ 
        title: "Activation Sent", 
        description: "A secure verification link has been sent to " + email
      });
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Delivery Failed', 
        description: parsed.message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Password must be 6+ characters.' });
    }
    if (password !== confirmPassword) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Passwords do not match.' });
    }
    if (!auth.currentUser || !memberDocId) return;

    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'Cannot activate password while offline. Please connect to the internet.',
      });
    }

    setIsLoading(true);
    try {
      await updatePassword(auth.currentUser, password);
      await activateMemberAccountAction(memberDocId);
      toast({ title: 'Success', description: 'Account activated successfully.' });
      router.push('/');
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ 
        variant: 'destructive', 
        title: parsed.title || 'Activation Failed', 
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
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      router.push('/');
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
          <CardTitle className="text-3xl font-headline font-bold">Ikimina App</CardTitle>
          <CardDescription>
            {step === 'email' && "Verify your member email"}
            {step === 'password' && "Enter your password to sign in"}
            {step === 'pending-activation' && "Secure Account Activation"}
            {step === 'set-password' && "Set your final account password"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
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

          {step === 'pending-activation' && (
            <div className="space-y-6">
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex gap-3 items-start text-left">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">One Last Step</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your account exists but isn't active. We will send a secure activation link to your email to verify your identity.
                  </p>
                </div>
              </div>
              <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold" onClick={handleSendActivationLink} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2 h-5 w-5" />}
                Request Activation Link
              </Button>
            </div>
          )}

          {step === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-xl flex gap-2 items-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-xs text-green-800 font-medium text-left">Verification successful. Set your password.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    className="pr-10 h-11 rounded-xl"
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
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="pr-10 h-11 rounded-xl"
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
              <Button className="w-full h-11 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2 h-5 w-5" />}
                Activate My Account
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t p-4">
          <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-bold">
            Secure Infrastructure Provided by ORVEXI
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
