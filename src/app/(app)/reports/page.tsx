
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Loader2, PieChart, ShieldAlert, TrendingUp, Wallet, HandCoins, AlertTriangle, Settings2, Percent } from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { allocateInterestAction, updateFinancialSettingsAction } from '@/app/actions/finance';
import { useToast } from '@/hooks/use-toast';

export default function ReportsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData } = useDoc(settingsRef);

  const [isAllocating, setIsAllocating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const role = userData?.role || 'member';
  const isAdmin = role === 'admin';
  const isAuthorized = role === 'admin' || role === 'management';

  const membersQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [isAuthorized]);

  const contributionsQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'contributions'), orderBy('date', 'desc'));
  }, [isAuthorized]);

  const loansQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
  }, [isAuthorized]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);

  const reportData = useMemo(() => {
    const totalContributed = contributions.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
    const totalInterestPaid = members.reduce((acc, curr: any) => acc + (Number(curr.accruedInterest) || 0), 0);
    
    const loanStats = loans.reduce((acc, loan: any) => {
      const balance = Number(loan.balance) || 0;
      if (loan.status === 'approved') {
        acc.outstandingBalance += balance;
        acc.activeCount++;
      }
      return acc;
    }, { outstandingBalance: 0, activeCount: 0 });

    const memberSummaries = members.map((m: any) => {
      const memberConts = contributions.filter((c: any) => c.memberId === m.id);
      const total = memberConts.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
      const memberLoans = loans.filter((l: any) => l.memberId === m.id && l.status === 'approved');
      const debt = memberLoans.reduce((acc, curr: any) => acc + (Number(curr.balance) || 0), 0);
      
      return {
        name: m.name,
        email: m.email,
        totalContributed: total,
        currentDebt: debt,
        accruedInterest: m.accruedInterest || 0,
        netBalance: total + (m.accruedInterest || 0) - debt
      };
    });

    return {
      totalContributed,
      totalInterestPaid,
      outstandingLoansBalance: loanStats.outstandingBalance,
      activeLoansCount: loanStats.activeCount,
      netPotValue: totalContributed - loanStats.outstandingBalance,
      memberSummaries
    };
  }, [members, contributions, loans]);

  const handleAllocateInterest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin || !user) return;
    
    setIsAllocating(true);
    const formData = new FormData(e.currentTarget);
    const totalInterestToDistribute = Number(formData.get('amount'));
    const justification = formData.get('justification') as string;

    try {
      await allocateInterestAction(user.uid, { totalInterestToDistribute, justification });
      toast({ title: "Distribution Complete", description: "Interest has been allocated pro-rata to all active members." });
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Allocation Failed", description: error.message });
    } finally {
      setIsAllocating(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsUpdatingSettings(true);
    const formData = new FormData(e.currentTarget);
    const loanInterestRate = Number(formData.get('loanInterestRate'));
    const contributionInterestRate = Number(formData.get('contributionInterestRate'));
    const justification = formData.get('justification') as string;

    try {
      await updateFinancialSettingsAction({ loanInterestRate, contributionInterestRate, justification });
      toast({ title: "Settings Updated", description: "Global interest rates have been securely updated." });
      setIsSettingsOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (userLoading || (isAuthorized && (loadingMembers || loadingContributions || loadingLoans))) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAuthorized) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only management can view financial reports.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Financial Health</h1>
          <p className="text-muted-foreground font-medium">Internal audits and standing reports</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setIsSettingsOpen(true)} className="rounded-xl">
                <Settings2 className="mr-2 h-4 w-4" /> Global Rates
              </Button>
              <Button onClick={() => setIsDialogOpen(true)} className="rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
                <HandCoins className="mr-2 h-4 w-4" /> Distribute Interest
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => window.print()} className="rounded-xl hidden md:flex">
            <FileText className="mr-2 h-4 w-4" /> Print PDF
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleUpdateSettings}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">Global Interest Rates</DialogTitle>
              <DialogDescription>
                Set the default percentages for loans and contribution yields.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanInterestRate">Loan Int. Rate (%)</Label>
                  <div className="relative">
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input name="loanInterestRate" type="number" step="0.1" defaultValue={settingsData?.loanInterestRate || 5} required className="h-11 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contributionInterestRate">Contrib. Yield (%)</Label>
                   <div className="relative">
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input name="contributionInterestRate" type="number" step="0.1" defaultValue={settingsData?.contributionInterestRate || 2} required className="h-11 rounded-xl" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="justification">Audit Justification</Label>
                <Textarea name="justification" placeholder="Reason for changing policy rates..." required className="rounded-xl min-h-[80px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isUpdatingSettings} className="w-full h-11 rounded-xl font-bold">
                {isUpdatingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleAllocateInterest}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">Pro-Rata Interest Distribution</DialogTitle>
              <DialogDescription>
                Allocates profits to members based on their percentage share of the total contribution pool.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-200 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-1" />
                <p className="text-xs text-orange-800 leading-relaxed font-medium">
                  This action is irreversible. All active members with contributions will receive their mathematical share of the amount specified.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Total Interest to Distribute (RWF)</Label>
                <Input name="amount" type="number" placeholder="e.g. 500000" required className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="justification">Audit Justification</Label>
                <Textarea name="justification" placeholder="E.g., End of year profit sharing cycle..." required className="rounded-xl min-h-[80px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isAllocating} className="w-full h-11 rounded-xl font-bold">
                {isAllocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                Confirm & Distribute
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-md bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Capital</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalContributed.toLocaleString()} RWF</div>
            <TrendingUp className="h-4 w-4 text-green-500 mt-1" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Loan Book</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.outstandingLoansBalance.toLocaleString()} RWF</div>
            <p className="text-[10px] text-orange-600 font-bold mt-1 uppercase">{reportData.activeLoansCount} Active Loans</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Accrued Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{reportData.totalInterestPaid.toLocaleString()} RWF</div>
            <p className="text-[10px] text-muted-foreground mt-1">Distributed to date</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Net Available Pot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{reportData.netPotValue.toLocaleString()} RWF</div>
            <Wallet className="h-4 w-4 text-green-500 mt-1" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/20">
          <CardTitle className="text-xl">Member Standings Audit</CardTitle>
          <CardDescription>Individual contribution totals, accrued interest, and current liabilities</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="py-4 px-6">Member</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right text-primary">Interest Share</TableHead>
                <TableHead className="text-right text-orange-600">Active Debt</TableHead>
                <TableHead className="text-right px-6 font-bold">Net Standing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.memberSummaries.map((m, idx) => (
                <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="py-4 px-6">
                    <div className="font-bold">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{m.totalContributed.toLocaleString()} RWF</TableCell>
                  <TableCell className="text-right text-primary font-bold">+{m.accruedInterest.toLocaleString()} RWF</TableCell>
                  <TableCell className="text-right text-orange-600 font-medium">
                    {m.currentDebt > 0 ? `-${m.currentDebt.toLocaleString()} RWF` : '0 RWF'}
                  </TableCell>
                  <TableCell className="text-right px-6 font-bold text-lg">
                    {m.netBalance.toLocaleString()} RWF
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
