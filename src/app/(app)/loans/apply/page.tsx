'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  HandCoins, 
  ShieldCheck, 
  Info, 
  ArrowLeft 
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';

export default function LoanApplyPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData } = useDoc(settingsRef);
  const currency = settingsData?.currency || 'RWF';

  const loansQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid));
  }, [user]);

  const { data: loansSnap } = useCollection(loansQuery);
  const loans = useMemo(() => loansSnap?.docs.map(d => d.data()) || [], [loansSnap]);

  const borrowingPower = useMemo(() => {
    if (!userData) return 0;
    const gained = userData.accruedInterest || 0;
    const completedCount = loans.filter((l: any) => l.status === 'completed').length;
    // Calculation logic from dashboard: (Interest Gained + Bonus per completed loan) * 2
    return (gained + (completedCount * 10000)) * 2;
  }, [userData, loans]);

  const handleApply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    try {
      await addDoc(collection(firestore, 'loans'), {
        memberId: user.uid,
        amount,
        description,
        status: 'requested',
        requestDate: serverTimestamp(),
        balance: 0,
        interestAmount: 0,
        penaltyRate: 0,
        durationMonths: 12
      });

      toast({ title: "Application Sent", description: "Your loan request has been submitted for management review." });
      router.push('/loans');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userDataLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-headline font-bold">Request Capital Loan</h1>
          <p className="text-sm text-muted-foreground">Submit a borrowing request for management review</p>
        </div>
      </div>

      <Card className="border border-border shadow-sm bg-card rounded-[10px] overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Loan Application</CardTitle>
          </div>
          <CardDescription>Apply for a loan based on your verified contribution weight.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleApply} className="space-y-8">
            <div className="p-4 bg-muted rounded-[10px] border border-border space-y-1">
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                 <ShieldCheck className="h-3 w-3 text-primary" /> Max Borrowing Power
               </p>
               <p className="text-2xl font-bold text-primary">
                  {formatCurrency(borrowingPower, currency)}
               </p>
               <p className="text-[9px] text-muted-foreground italic leading-relaxed">
                 Calculated based on your verified savings and internal audit score. 
                 Final approval is subject to system policy.
               </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Requested Amount</Label>
                <div className="relative">
                  <Input 
                    name="amount" 
                    type="number" 
                    placeholder="e.g. 500000" 
                    required 
                    className="h-12 rounded-[10px] pr-12 bg-muted border-none text-lg font-bold" 
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{currency}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Purpose of Loan</Label>
                <Textarea 
                  name="description" 
                  placeholder="E.g., Small business expansion, school fees, etc." 
                  required 
                  className="rounded-[10px] bg-muted border-none min-h-[120px] p-4" 
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
               <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
               <p className="text-[11px] text-primary/80 leading-relaxed font-medium">
                 Your request will be audited by Management. Once approved, the amortization schedule will be generated and interest applied per system policy. You can track the status in your Portfolio.
               </p>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full h-14 rounded-[10px] font-bold shadow-lg text-lg">
              {isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <HandCoins className="mr-2 h-5 w-5" />}
              Submit Loan Request
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
