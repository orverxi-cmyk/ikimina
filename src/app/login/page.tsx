
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Loader2, LogIn, UserCheck, ArrowRight, ShieldCheck, Mail, Key, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [step, setStep] = useState<'email' | 'password' | 'activate'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [memberDocId, setMemberDocId] = useState<string | null>(null);

  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const q = query(collection(firestore, 'users'), where('email', '==', email.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('This email is not registered in the SCDT Tontine system. Please contact your administrator.');
      }

      const memberDoc = querySnapshot.docs[0];
      const memberData = memberDoc.data();
      setMemberDocId(memberDoc.id);

      if (memberData.status === 'active') {
        setStep('password');
      } else {
        setStep('activate');
        toast({
          title: "Account Found",
          description: "Please enter your activation code (OTP) and set a password.",
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Check Failed',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: 'Invalid password. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Passwords do not match.' });
    }
    if (!memberDocId) return;

    setIsLoading(true);
    try {
      // Verify OTP again just to be safe
      const userRef = doc(firestore, 'users', memberDocId);
      const q = query(collection(firestore, 'users'), where('email', '==', email), where('otp', '==', otp));
      const snap = await getDocs(q);

      if (snap.empty) {
        throw new Error('Invalid activation code.');
      }

      // Create Auth User
      await createUserWithEmailAndPassword(auth, email, password);

      // Update Firestore
      await updateDoc(userRef, {
        status: 'active',
        otp: null,
        activatedAt: serverTimestamp(),
      });

      toast({ title: 'Success', description: 'Account activated! You are now logged in.' });
      router.push('/');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Activation Failed', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Reset Link Sent", description: "Check your email to reset your password." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
          <CardTitle className="text-3xl font-headline font-bold tracking-tight">SCDT Tontine</CardTitle>
          <CardDescription>
            {step === 'email' && "Enter your email to get started"}
            {step === 'password' && "Welcome back! Enter your password"}
            {step === 'activate' && "Activate your new account"}
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
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button className="w-full h-11" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                Continue
              </Button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input value={email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Password</Label>
                  <Button 
                    variant="link" 
                    type="button" 
                    className="p-0 h-auto text-xs"
                    onClick={handleForgotPassword}
                  >
                    Forgot Password?
                  </Button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    className="pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button className="w-full h-11" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                Sign In
              </Button>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep('email')}>
                Use a different email
              </Button>
            </form>
          )}

          {step === 'activate' && (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg flex gap-3 items-start">
                <ShieldCheck className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800">
                  Your account is pending activation. Please enter the OTP provided by your administrator.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="otp">Activation Code (OTP)</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="otp"
                    placeholder="6-digit code"
                    className="pl-10"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Set New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button className="w-full h-11 bg-green-600 hover:bg-green-700" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserCheck className="mr-2 h-5 w-5" />}
                Activate & Sign In
              </Button>
              
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep('email')}>
                Back
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            SCDT Tontine Management System v1.0 <br />
            Protected by Firebase Authentication
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
