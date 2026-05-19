'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { ShieldCheck, Loader2, Save, Percent, Wallet, Info } from 'lucide-react';
import { updateFinancialSettingsAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData, loading: settingsLoading } = useDoc(settingsRef);

  const [isUpdating, setIsUpdating] = useState(false);

  const isAdmin = userData?.role === 'admin';

  const handleUpdateSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsUpdating(true);
    const formData = new FormData(e.currentTarget);
    const loanInterestRate = Number(formData.get('loanInterestRate'));
    const contributionInterestRate = Number(formData.get('contributionInterestRate'));
    const maxLoanPercentage = Number(formData.get('maxLoanPercentage'));
    const minLoanAmount = Number(formData.get('minLoanAmount'));
    const maxLoanAmount = Number(formData.get('maxLoanAmount'));
    const justification = formData.get('justification') as string;

    try {
      await updateFinancialSettingsAction({ 
        loanInterestRate, 
        contributionInterestRate, 
        maxLoanPercentage, 
        minLoanAmount, 
        maxLoanAmount,
        justification 
      });
      toast({ title: "Settings Updated", description: "Global financial policies updated successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsUpdating(false);
    }
  };

  if (userLoading || settingsLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldCheck className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can access system settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-24">
      <div>
        <h1 className="text-3xl font-headline font-bold">System Settings</h1>
        <p className="text-muted-foreground">Manage global financial rules and lending policies</p>
      </div>

      <form onSubmit={handleUpdateSettings}>
        <div className="grid gap-6">
          <Card className="border-none shadow-lg bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wallet className="h-5 w-5 text-primary" /> Lending Constraints
              </CardTitle>
              <CardDescription>Define limits for member loans and risk management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">Borrowing Power (%) <Percent className="h-3 w-3" /></Label>
                  <Input 
                    name="maxLoanPercentage" 
                    type="number" 
                    step="1" 
                    defaultValue={settingsData?.maxLoanPercentage || 80} 
                    required 
                    className="h-11 rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Max % of total contributions a member can borrow.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Min Loan Amount (RWF)</Label>
                  <Input 
                    name="minLoanAmount" 
                    type="number" 
                    defaultValue={settingsData?.minLoanAmount || 5000} 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Loan Amount (RWF)</Label>
                  <Input 
                    name="maxLoanAmount" 
                    type="number" 
                    defaultValue={settingsData?.maxLoanAmount || 1000000} 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Info className="h-5 w-5" /> Interest Policy
              </CardTitle>
              <CardDescription>Configure earnings and costs for the tontine pool</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Loan Interest (Interest In - % Monthly)</Label>
                  <Input 
                    name="loanInterestRate" 
                    type="number" 
                    step="0.01" 
                    defaultValue={settingsData?.loanInterestRate || 10} 
                    required 
                    className="h-11 rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground">Rate charged to borrowers.</p>
                </div>
                <div className="space-y-2">
                  <Label>Target Monthly Contribution (RWF)</Label>
                  <Input 
                    name="contributionInterestRate" 
                    type="number" 
                    defaultValue={settingsData?.contributionInterestRate || 50000} 
                    required 
                    className="h-11 rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground">Standard monthly contribution target.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-card border-primary/10">
            <CardHeader>
              <CardTitle className="text-xl">Authorization</CardTitle>
              <CardDescription>Confirm changes with a permanent audit justification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="justification">Audit Justification</Label>
                <Textarea 
                  id="justification"
                  name="justification" 
                  placeholder="E.g., Adjusted borrowing limits based on Board resolution..." 
                  required 
                  className="rounded-xl min-h-[100px]"
                />
              </div>
              <Button type="submit" disabled={isUpdating} className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20">
                {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                Save Financial Policies
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
