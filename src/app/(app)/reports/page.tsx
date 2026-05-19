
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Loader2, 
  ShieldAlert, 
  TrendingUp,
  TrendingDown,
  Calendar
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, Timestamp } from 'firebase/firestore';
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
import { allocateInterestAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';
import { isWithinInterval, getYear, startOfYear, endOfYear } from 'date-fns';

export default function ReportsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const [isAllocating, setIsAllocating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const currentYear = new Date().getFullYear().toString();
  const [periodFilter, setPeriodFilter] = useState<string>(currentYear);

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

  const auditLogsQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc'));
  }, [isAuthorized]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: auditLogsSnap, loading: loadingLogs } = useCollection(auditLogsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const auditLogs = useMemo(() => auditLogsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [auditLogsSnap]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    loans.forEach((l: any) => {
      if (l.approvedAt) years.add(getYear(l.approvedAt.toDate()));
    });
    auditLogs.forEach((log: any) => {
      if (log.timestamp) {
        const d = log.timestamp instanceof Timestamp ? log.timestamp.toDate() : new Date(log.timestamp);
        years.add(getYear(d));
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [loans, auditLogs]);

  const reportData = useMemo(() => {
    const isLifetime = periodFilter === 'lifetime';
    const filterYear = parseInt(periodFilter);
    const filterInterval = isLifetime ? null : {
      start: startOfYear(new Date(filterYear, 0, 1)),
      end: endOfYear(new Date(filterYear, 0, 1))
    };

    const totalContributed = contributions.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
    
    const filteredInterestIn = loans.reduce((acc, loan: any) => {
      if (loan.status === 'approved' && loan.approvedAt) {
        const approvedDate = loan.approvedAt.toDate();
        const isInPeriod = isLifetime || (filterInterval && isWithinInterval(approvedDate, filterInterval));
        if (isInPeriod) {
          return acc + (Number(loan.interestAmount) || 0);
        }
      }
      return acc;
    }, 0);

    const filteredInterestOut = auditLogs.reduce((acc, log: any) => {
      if (log.action === 'ALLOCATE_INTEREST' && log.timestamp) {
        const logDate = log.timestamp instanceof Timestamp ? log.timestamp.toDate() : new Date(log.timestamp);
        const isInPeriod = isLifetime || (filterInterval && isWithinInterval(logDate, filterInterval));
        if (isInPeriod) {
          return acc + (Number(log.details?.totalDistributed) || 0);
        }
      }
      return acc;
    }, 0);

    const loanStats = loans.reduce((acc, loan: any) => {
      const balance = Number(loan.balance) || 0;
      if (loan.status === 'approved') {
        acc.outstandingBalance += balance;
        acc.activeCount++;
      }
      return acc;
    }, { outstandingBalance: 0, activeCount: 0 });

    const memberSummaries = members.map((m: any) => {
      const total = contributions
        .filter((c: any) => c.memberId === m.id)
        .reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
      
      const debt = loans
        .filter((l: any) => l.memberId === m.id && l.status === 'approved')
        .reduce((acc, curr: any) => acc + (Number(curr.balance) || 0), 0);
      
      return {
        id: m.id,
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
      filteredInterestIn,
      filteredInterestOut,
      outstandingLoansBalance: loanStats.outstandingBalance,
      activeLoansCount: loanStats.activeCount,
      netPotValue: totalContributed + filteredInterestIn - filteredInterestOut,
      memberSummaries
    };
  }, [members, contributions, loans, auditLogs, periodFilter]);

  const handleAllocateInterest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin || !user) return;
    
    setIsAllocating(true);
    const formData = new FormData(e.currentTarget);
    const totalInterestToDistribute = Number(formData.get('amount'));
    const justification = formData.get('justification') as string;

    try {
      await allocateInterestAction(user.uid, { totalInterestToDistribute, justification });
      toast({ title: "Distribution Complete", description: "Interest has been allocated pro-rata." });
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Allocation Failed", description: error.message });
    } finally {
      setIsAllocating(false);
    }
  };

  if (userLoading || (isAuthorized && (loadingMembers || loadingContributions || loadingLoans || loadingLogs))) {
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
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Financial Standing</h1>
          <p className="text-muted-foreground font-medium">Internal audit and yearly performance tracking</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl mr-2">
            <Calendar className="ml-2 h-4 w-4 text-muted-foreground" />
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[160px] h-8 border-none bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lifetime">Lifetime</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>Year {year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setIsDialogOpen(true)} className="rounded-xl h-9">
              <TrendingUp className="mr-2 h-4 w-4" /> Distribute Profit
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* ... (Existing metric cards) ... */}
      </div>

      <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/10 border-b">
          <CardTitle className="text-lg">Member Standings Audit</CardTitle>
          <CardDescription>Individual contribution history and current liability status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/5">
              <TableRow>
                <TableHead className="py-4 px-6">Member</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right text-primary">Interest Earned</TableHead>
                <TableHead className="text-right text-orange-600">Active Debt</TableHead>
                <TableHead className="text-right px-6 font-bold">Net Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.memberSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic">No members found.</TableCell>
                </TableRow>
              ) : (
                reportData.memberSummaries.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAllocateInterest}>
            <DialogHeader>
              <DialogTitle>Distribute Profits</DialogTitle>
              <DialogDescription>Share accumulated interest among members based on their contribution weight.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Total Amount to Distribute (RWF)</Label>
                <Input name="amount" type="number" required placeholder="500000" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="justification">Audit Justification</Label>
                <Textarea name="justification" required placeholder="Reason for distribution..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isAllocating} className="w-full">
                {isAllocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                Execute Distribution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
