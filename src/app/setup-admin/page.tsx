'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function SetupAdminPage() {
  const { user, loading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isPromoting, setIsPromoting] = useState(false);

  const handlePromote = async () => {
    if (!user) return;
    setIsPromoting(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, {
        role: 'admin',
        status: 'active'
      });
      toast({
        title: "Success",
        description: "Your account has been promoted to Admin. Please refresh the page.",
      });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Promotion Failed",
        description: "Ensure you are logged in first. " + error.message,
      });
    } finally {
      setIsPromoting(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <ShieldCheck className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-headline">Admin Bootstrap</CardTitle>
          <CardDescription>
            Promote the current logged-in user to the Admin role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user ? (
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" />
              Please login first to use this utility.
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="text-sm">
                <p className="text-muted-foreground font-medium">Target User:</p>
                <p className="font-bold">{user.email}</p>
              </div>
              <Button 
                onClick={handlePromote} 
                className="w-full" 
                disabled={isPromoting}
              >
                {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Make me Admin
              </Button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center italic">
            Note: This route should be deleted after the first admin is created.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
