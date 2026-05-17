
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useFirestore } from '@/firebase/provider';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Loader2, AlertCircle, Terminal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';

export default function SetupAdminPage() {
  const { user, loading: userLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // 1. Create User in Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2. Create User Doc in Firestore
      await setDoc(doc(firestore, 'users', uid), {
        name: "Initial Admin",
        email: email.toLowerCase(),
        role: 'admin',
        status: 'active',
        joinedAt: serverTimestamp(),
        activatedAt: serverTimestamp(),
      });

      // 3. Set Bootstrap Flag (Closes the backdoor in Security Rules)
      await setDoc(doc(firestore, 'settings', 'bootstrap'), {
        initialized: true,
        initializedBy: uid,
        initializedAt: serverTimestamp()
      });

      toast({
        title: "Success",
        description: "Admin account created and system bootstrapped!",
      });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Bootstrap Failed",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-primary/20 shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-4 rounded-full">
                <ShieldCheck className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-headline">System Bootstrap</CardTitle>
            <CardDescription>
              Create the first Admin account. This will activate the system and close registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="text-center space-y-4">
                <p className="text-sm">You are already logged in as:</p>
                <p className="font-bold">{user.email}</p>
                <Button variant="outline" onClick={() => router.push('/')} className="w-full">Go to Dashboard</Button>
              </div>
            ) : (
              <form onSubmit={handleBootstrap} className="space-y-4">
                <div className="space-y-2">
                  <Label>Admin Email</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="admin@example.com" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Admin Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Register & Bootstrap Admin
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50 border-none shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Terminal className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">Terminal Alternative</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  If you prefer the command line, use the provided script:
                </p>
                <code className="block p-2 bg-black text-white text-[10px] rounded border border-white/10">
                  npm run set-admin
                </code>
                <p className="text-[10px] text-muted-foreground italic">
                  * Requires GOOGLE_APPLICATION_CREDENTIALS set in your environment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
