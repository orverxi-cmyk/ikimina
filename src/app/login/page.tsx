
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
  sendSignInLinkToEmail
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Loader2, LogIn, Mail, Lock, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [step, setStep] = useState<'email' | 'password' | 'pending-activation' | 'set-password'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [memberDocId, setMemberDocId] = useState<string | null>(null);

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
            await signInWithEmailLink(auth, emailForLink, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            
            // Once signed in, search for the user doc to see if activation is needed
            const q = query(
              collection(firestore, 'users'), 
              where('email', '==', emailForLink.toLowerCase()), 
              limit(1)
            );
            const snap = await getDocs(q);
            
            if (!snap.empty) {
              const member = snap.docs[0];
              setMemberDocId(member.id);
              setEmail(emailForLink);
              if (member.data().status === 'pending') {
                setStep('set-password');
              } else {
                router.push('/');
              }
            } else {
              router.push('/');
            }
          } catch (error: any) {
            toast({ variant: 'destructive', title: 'Invalid Link', description: error.message });
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
    
    setIsLoading(true);
    try {
      // Security rules allow unauthenticated list if limit is 1
      const q = query(
        collection(firestore, 'users'), 
        where('email', '==', email.trim().toLowerCase()), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('This email is not registered. Please contact your administrator.');
      }

      const memberDoc = querySnapshot.docs[0];
      const memberData = memberDoc.data();
      setMemberDocId(memberDoc.id);

      if (memberData.status === 'active') {
        setStep('password');
      } else {
        setStep('pending-activation');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lookup Failed', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendActivationLink = async () => {
    setIsLoading(true);
    try {
      const actionCodeSettings = {
        url: window.location.origin + '/login',
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      toast({ 
        title: "Link Sent!", 
        description: "Please check your email to activate your account." 
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast({ variant: 'destructive', title: 'Error', description: 'Passwords do not match.' });
    }
    if (!auth.currentUser || !memberDocId) return;

    setIsLoading(true);
    try {
      await updatePassword(auth.currentUser, password);
      await updateDoc(doc(firestore, 'users', memberDocId), {
        status: 'active',
        activatedAt: serverTimestamp(),
      });
      toast({ title: 'Success', description: 'Password set and account activated!' });
      router.push('/');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
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
      toast({ variant: 'destructive', title: 'Login Failed', description: 'Invalid password.' });
    } finally {
      setIsLoading(false);
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
            {step === 'email' && "Enter your email to continue"}
            {step === 'password' && "Welcome back! Enter your password"}
            {step === 'pending-activation' && "Account Activation Required"}
            {step === 'set-password' && "Create your permanent password"}
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
                <Label>Email</Label>
                <Input value={email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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

          {step === 'pending-activation' && (
            <div className="space-y-6">
              <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-lg flex gap-3 items-start">
                <ShieldCheck className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-orange-900">Invite Found</p>
                  <p className="text-xs text-orange-800 leading-relaxed">
                    An account has been prepared for you. We need to verify your email to activate your account.
                  </p>
                </div>
              </div>
              <Button className="w-full h-11 bg-orange-600 hover:bg-orange-700" onClick={handleSendActivationLink} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2 h-5 w-5" />}
                Send Activation Link
              </Button>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep('email')}>
                Back
              </Button>
            </div>
          )}

          {step === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-lg flex gap-2 items-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-xs text-green-800 font-medium">Link verified. Now set your password.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Create Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button className="w-full h-11 bg-green-600 hover:bg-green-700" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2 h-5 w-5" />}
                Activate My Account
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t p-4">
          <p className="text-xs text-muted-foreground text-center italic">
            Secure Member-Only Access <br />
            Powered by ORVEXI Limited
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
