'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { ShieldCheck, Loader2, Save, Percent, Wallet, Info, Globe, Scale } from 'lucide-react';
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
  const [selectedCurrency, setSelectedCurrency] = useState<string>('RWF');
  const [interestModel, setInterestModel] = useState<string>('one-off');
  const [interestType, setInterestType] = useState<string>('immediate');

  useEffect(() => {
    if (settingsData) {
      if (settingsData.currency) setSelectedCurrency(settingsData.currency);
      if (settingsData.interestModel) setInterestModel(settingsData.interestModel);
      if (settingsData.interestType) setInterestType(settingsData.interestType);
    }
  }, [settingsData]);

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
        currency: selectedCurrency,
        loanInterestRate, 
        interestModel,
        interestType,
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
        <h2 className="text-2xl font-bold font-headline text-white">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can access system settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-24">
      <div>
        <h1 className="text-3xl font-headline font-bold text-white">System Settings</h1>
        <p className="text-muted-foreground">Manage global financial rules and lending policies</p>
      </div>

      <form onSubmit={handleUpdateSettings}>
        <div className="grid gap-6">
          {/* Regional Settings Card */}
          <Card className="border-none shadow-lg bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Globe className="h-5 w-5 text-primary" /> Regional Settings
              </CardTitle>
              <CardDescription>Configure currency and display preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-sm">
                <Label>System Currency</Label>
                <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                  <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                    <SelectValue placeholder="Select Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RWF">Rwandan Franc (RWF)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Lending Constraints Card */}
          <Card className="border-none shadow-lg bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Wallet className="h-5 w-5" /> Lending Constraints
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
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Max % of total contributions a member can borrow.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Min Loan Amount</Label>
                  <Input 
                    name="minLoanAmount" 
                    type="number" 
                    defaultValue={settingsData?.minLoanAmount || 5000} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Loan Amount</Label>
                  <Input 
                    name="maxLoanAmount" 
                    type="number" 
                    defaultValue={settingsData?.maxLoanAmount || 1000000} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interest Policy Card */}
          <Card className="border-none shadow-lg bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Scale className="h-5 w-5" /> Interest Policy (LOCKED Fields)
              </CardTitle>
              <CardDescription>Configure global rates that will be locked during loan requests and approvals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Interest Model</Label>
                  <Select value={interestModel} onValueChange={setInterestModel}>
                    <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-off">One-Off (Flat)</SelectItem>
                      <SelectItem value="monthly">Monthly Interest</SelectItem>
                      <SelectItem value="yearly">Yearly (APR)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Sets how interest is calculated globally.</p>
                </div>
                <div className="space-y-2">
                  <Label>Interest Type (Deduction)</Label>
                  <Select value={interestType} onValueChange={setInterestType}>
                    <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Discounted (Deduct Now)</SelectItem>
                      <SelectItem value="afterward">Added-on (Pay Later)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Sets if interest is taken at source or added to principal.</p>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Global Interest Rate (%)</Label>
                  <Input 
                    name="loanInterestRate" 
                    type="number" 
                    step="0.01" 
                    defaultValue={settingsData?.loanInterestRate || 10} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground">Rate charged to borrowers. This will be read-only in the application process.</p>
                </div>
                <div className="space-y-2">
                  <Label>Target Monthly Contribution</Label>
                  <Input 
                    name="contributionInterestRate" 
                    type="number" 
                    defaultValue={settingsData?.contributionInterestRate || 50000} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground">Standard monthly contribution target.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Authorization Card */}
          <Card className="border-none shadow-lg bg-card rounded-[10px] border-primary/10">
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
                  className="rounded-[10px] min-h-[100px] bg-muted border-none"
                />
              </div>
              <Button type="submit" disabled={isUpdating} className="w-full h-12 rounded-[10px] font-bold shadow-lg shadow-primary/20">
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
