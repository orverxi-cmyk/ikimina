'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useFirestore } from '@/firebase/provider';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Loader2, Terminal } from 'lucide-react';
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
  const [formData, setFormData] = useState({
    firstName: '',
    surname: '',
    email: '',
    password: ''
  });

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // 1. Create User in Auth
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const uid = userCredential.user.uid;

      // 2. Create User Doc in Firestore
      await setDoc(doc(firestore, 'users', uid), {
        name: `${formData.firstName} ${formData.surname}`.trim(),
        email: formData.email.toLowerCase(),
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (userLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-primary/20 shadow-2xl rounded-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-4 rounded-full">
                <ShieldCheck className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-headline font-bold">System Bootstrap</CardTitle>
            <CardDescription>
              Establish the initial legal administrator for the Ikimina App.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="text-center space-y-4">
                <p className="text-sm">You are already authenticated as:</p>
                <div className="p-3 bg-muted rounded-xl font-bold">{user.email}</div>
                <Button variant="outline" onClick={() => router.push('/')} className="w-full h-11 rounded-xl">Go to Dashboard</Button>
              </div>
            ) : (
              <form onSubmit={handleBootstrap} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName"
                      name="firstName"
                      type="text" 
                      value={formData.firstName} 
                      onChange={handleInputChange} 
                      placeholder="Jean" 
                      required 
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surname">Surname</Label>
                    <Input 
                      id="surname"
                      name="surname"
                      type="text" 
                      value={formData.surname} 
                      onChange={handleInputChange} 
                      placeholder="Mugisha" 
                      required 
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Admin Email</Label>
                  <Input 
                    id="email"
                    name="email"
                    type="email" 
                    value={formData.email} 
                    onChange={handleInputChange} 
                    placeholder="admin@ikimina.com" 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">System Password</Label>
                  <Input 
                    id="password"
                    name="password"
                    type="password" 
                    value={formData.password} 
                    onChange={handleInputChange} 
                    placeholder="••••••••" 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Register & Bootstrap Admin
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Terminal className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Terminal Alternative</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  For service-account based setup, execute the root script:
                </p>
                <code className="block p-2 bg-black text-white text-[10px] rounded-lg border border-white/10 font-mono">
                  npm run set-admin
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
