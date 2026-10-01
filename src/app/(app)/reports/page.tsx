'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Loader2, 
  ShieldAlert, 
  TrendingUp,
  Calendar,
  DollarSign,
  Info,
  History,
  AlertTriangle,
  CheckCircle2,
  PiggyBank,
  Scale,
  Trash2,
  AlertOctagon,
  RotateCcw
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allocateInterestAction, resetFinancialDataAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';
import { isWithinInterval, getYear, startOfYear, endOfYear, format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { useSettings } from '@/context/settings-context';

export default function ReportsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const { settings } = useSettings();
  const currency = settings.currency;

  const [isAllocating, setIsAllocating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [distributeAmountInput, setDistributeAmountInput] = useState<string>('');
  const [justificationInput, setJustificationInput] = useState<string>('');

  // Super Admin Reset State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetJustification, setResetJustification] = useState('');
  
  const currentYear = new Date().getFullYear().toString();
  const [periodFilter, setPeriodFilter] = useState<string>(currentYear);

  const role = userData?.role || 'member';
  const isAdmin = role === 'admin';
  const isSuperAdmin = userData?.isSuperAdmin === true || user?.email === 'tharushyamagara@gmail.com';
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

  const distributionsQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'interest_distributions'), orderBy('distributedAt', 'desc'));
  }, [isAuthorized]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: auditLogsSnap, loading: loadingLogs } = useCollection(auditLogsQuery);
  const { data: distributionsSnap } = useCollection(distributionsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const auditLogs = useMemo(() => auditLogsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [auditLogsSnap]);
  const distributions = useMemo(() => distributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [distributionsSnap]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    loans.forEach((l: any) => {
      const dateVal = l.approvedAt || l.repaidAt || l.requestDate;
      if (dateVal) {
        const d = dateVal instanceof Timestamp ? dateVal.toDate() : new Date(dateVal);
        years.add(getYear(d));
      }
    });
    auditLogs.forEach((log: any) => {
      if (log.timestamp) {
        const d = log.timestamp instanceof Timestamp ? log.timestamp.toDate() : new Date(log.timestamp);
        years.add(getYear(d));
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [loans, auditLogs]);

  // Core Financial Logic with undistributed pool calculations
  const reportData = useMemo(() => {
    const isLifetime = periodFilter === 'lifetime';
    const filterYear = parseInt(periodFilter);
    const filterInterval = isLifetime ? null : {
      start: startOfYear(new Date(filterYear, 0, 1)),
      end: endOfYear(new Date(filterYear, 0, 1))
    };

    const totalContributed = contributions.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
    
    // Lifetime realized group interest across approved and completed loans
    const lifetimeRealizedInterest = loans.reduce((acc, loan: any) => {
      if (loan.status === 'approved' || loan.status === 'completed') {
        return acc + (Number(loan.interestAmount) || 0);
      }
      return acc;
    }, 0);

    // Lifetime interest distributed to date from audit logs
    const lifetimeDistributedInterest = auditLogs.reduce((acc, log: any) => {
      if (log.action === 'ALLOCATE_INTEREST') {
        return acc + (Number(log.details?.totalDistributed) || 0);
      }
      return acc;
    }, 0);

    // Exact net undistributed interest pool available for safe distribution
    const availableUndistributedInterest = Math.max(0, lifetimeRealizedInterest - lifetimeDistributedInterest);

    // Period-filtered interest in (both approved and completed loans count)
    const filteredInterestIn = loans.reduce((acc, loan: any) => {
      if (loan.status === 'approved' || loan.status === 'completed') {
        const targetDate = loan.approvedAt || loan.repaidAt || loan.requestDate;
        if (targetDate) {
          const loanDate = targetDate instanceof Timestamp ? targetDate.toDate() : new Date(targetDate);
          const isInPeriod = isLifetime || (filterInterval && isWithinInterval(loanDate, filterInterval));
          if (isInPeriod) {
            return acc + (Number(loan.interestAmount) || 0);
          }
        }
      }
      return acc;
    }, 0);

    // Period-filtered interest distributed
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
      } else if (loan.status === 'completed') {
        acc.completedCount++;
      }
      return acc;
    }, { outstandingBalance: 0, activeCount: 0, completedCount: 0 });

    // Calculate individual member standings
    const memberSummaries = members.map((m: any) => {
      const memberContributions = contributions
        .filter((c: any) => c.memberId === m.id)
        .reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
      
      const debt = loans
        .filter((l: any) => l.memberId === m.id && l.status === 'approved')
        .reduce((acc, curr: any) => acc + (Number(curr.balance) || 0), 0);
      
      const shareWeight = totalContributed > 0 ? (memberContributions / totalContributed) : 0;
      const accrued = Number(m.accruedInterest) || 0;

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        totalContributed: memberContributions,
        shareWeight,
        currentDebt: debt,
        accruedInterest: accrued,
        netBalance: memberContributions + accrued - debt
      };
    });

    return {
      totalContributed,
      lifetimeRealizedInterest,
      lifetimeDistributedInterest,
      availableUndistributedInterest,
      filteredInterestIn,
      filteredInterestOut,
      outstandingLoansBalance: loanStats.outstandingBalance,
      activeLoansCount: loanStats.activeCount,
      completedLoansCount: loanStats.completedCount,
      netPotValue: totalContributed + filteredInterestIn - filteredInterestOut,
      memberSummaries
    };
  }, [members, contributions, loans, auditLogs, periodFilter]);

  // Pre-Distribution Simulator calculations
  const parsedDistributeAmount = Number(distributeAmountInput) || 0;
  const isAmountValid = parsedDistributeAmount > 0 && parsedDistributeAmount <= reportData.availableUndistributedInterest;
  const isAmountExceeded = parsedDistributeAmount > reportData.availableUndistributedInterest;

  const simulationPreview = useMemo(() => {
    if (parsedDistributeAmount <= 0 || reportData.totalContributed <= 0) return [];

    return reportData.memberSummaries
      .filter(m => m.totalContributed > 0)
      .map(m => {
        const shareFraction = m.totalContributed / reportData.totalContributed;
        const incomingShare = Math.round(shareFraction * parsedDistributeAmount);
        const projectedTotalInterest = m.accruedInterest + incomingShare;

        return {
          id: m.id,
          name: m.name,
          totalContributed: m.totalContributed,
          percentage: (shareFraction * 100).toFixed(1),
          currentInterest: m.accruedInterest,
          incomingShare,
          projectedTotalInterest
        };
      });
  }, [parsedDistributeAmount, reportData.totalContributed, reportData.memberSummaries]);

  const handleAllocateInterest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin || !user) return;
    
    if (parsedDistributeAmount <= 0) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Distribution amount must be greater than zero." });
      return;
    }

    if (parsedDistributeAmount > reportData.availableUndistributedInterest) {
      toast({ 
        variant: "destructive", 
        title: "Amount Exceeds Available Pool", 
        description: `You cannot distribute more than ${formatCurrency(reportData.availableUndistributedInterest, currency)} of unallocated interest.` 
      });
      return;
    }

    setIsAllocating(true);

    try {
      await allocateInterestAction(user.uid, { 
        totalInterestToDistribute: parsedDistributeAmount, 
        justification: justificationInput 
      });
      toast({ 
        title: "Distribution Successful", 
        description: `Successfully distributed ${formatCurrency(parsedDistributeAmount, currency)} pro-rata to all active savers.` 
      });
      setIsDialogOpen(false);
      setDistributeAmountInput('');
      setJustificationInput('');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Allocation Failed", description: error.message });
    } finally {
      setIsAllocating(false);
    }
  };

  const handleResetFinancialData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Only Super Administrators can perform this action." });
      return;
    }

    if (resetConfirmationText.trim() !== 'RESET FINANCIAL DATA') {
      toast({ 
        variant: "destructive", 
        title: "Confirmation Required", 
        description: 'Please type "RESET FINANCIAL DATA" exactly to confirm.' 
      });
      return;
    }

    if (!resetJustification.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Justification Required", 
        description: "An audit justification is required." 
      });
      return;
    }

    setIsResetting(true);

    try {
      const result: any = await resetFinancialDataAction({ 
        justification: resetJustification,
        adminEmail: user?.email || 'tharushyamagara@gmail.com'
      });

      toast({ 
        title: "Financial Ledger Reset to 0", 
        description: `Successfully wiped ${result?.summary?.contributionsDeleted || 0} contributions, ${result?.summary?.loansDeleted || 0} loans, and reset all member savings and interest balances to 0.` 
      });

      setIsResetDialogOpen(false);
      setResetConfirmationText('');
      setResetJustification('');
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Reset Operation Failed", 
        description: error.message || 'An error occurred while resetting financial records.' 
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (userLoading || (isAuthorized && (loadingMembers || loadingContributions || loadingLoans || loadingLogs))) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Financial Standing & Audits</h1>
          <p className="text-muted-foreground font-medium">Interest tracking, pro-rata dividend distribution, and member balances</p>
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
            <Button 
              size="sm" 
              onClick={() => {
                setDistributeAmountInput('');
                setJustificationInput('');
                setIsDialogOpen(true);
              }} 
              className="rounded-xl h-9 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              <TrendingUp className="mr-2 h-4 w-4" /> Distribute Profit
            </Button>
          )}
          {isSuperAdmin && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                setResetConfirmationText('');
                setResetJustification('');
                setIsResetDialogOpen(true);
              }} 
              className="rounded-xl h-9 font-semibold shadow-sm"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Reset to 0
            </Button>
          )}
        </div>
      </div>

      {/* Undistributed Pool Spotlight Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-600">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Available Undistributed Interest Pool</h3>
                <Badge variant={reportData.availableUndistributedInterest > 0 ? "default" : "secondary"} className="text-xs">
                  {reportData.availableUndistributedInterest > 0 ? "Ready to Share" : "Fully Allocated"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Realized: {formatCurrency(reportData.lifetimeRealizedInterest, currency)} &bull; Previously Distributed: {formatCurrency(reportData.lifetimeDistributedInterest, currency)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(reportData.availableUndistributedInterest, currency)}
              </div>
              <div className="text-[11px] text-muted-foreground">Net Safe Distribution Pool</div>
            </div>
            {isAdmin && reportData.availableUndistributedInterest > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 h-9"
                onClick={() => {
                  setDistributeAmountInput(reportData.availableUndistributedInterest.toString());
                  setIsDialogOpen(true);
                }}
              >
                Distribute Now
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Loan Interest In ({periodFilter === 'lifetime' ? 'Lifetime' : periodFilter})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              +{formatCurrency(reportData.filteredInterestIn, currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Earnings from approved & repaid loans</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Interest Distributed Out ({periodFilter === 'lifetime' ? 'Lifetime' : periodFilter})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              -{formatCurrency(reportData.filteredInterestOut, currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Credited to member interest balances</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Total Contribution Pot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(reportData.totalContributed, currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Active cumulative savings base</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Active Loan Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(reportData.outstandingLoansBalance, currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {reportData.activeLoansCount} active &bull; {reportData.completedLoansCount} completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs: Member Audit Standings vs Distribution History */}
      <Tabs defaultValue="standings" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-muted/40 p-1 rounded-xl">
            <TabsTrigger value="standings" className="rounded-lg text-sm font-semibold">
              <PiggyBank className="h-4 w-4 mr-2" /> Member Standings Audit
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg text-sm font-semibold">
              <History className="h-4 w-4 mr-2" /> Distribution History Ledger
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Member Standings Audit Tab */}
        <TabsContent value="standings">
          <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-lg">Individual Member Standings Audit</CardTitle>
              <CardDescription>
                Live snapshot of individual member contributions, pro-rata ownership weight, accumulated interest earned, and current net standing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead className="py-4 px-6">Member</TableHead>
                    <TableHead className="text-right">Savings / Contributions</TableHead>
                    <TableHead className="text-right">Pool Share %</TableHead>
                    <TableHead className="text-right text-primary">Accumulated Interest</TableHead>
                    <TableHead className="text-right text-orange-600">Active Debt</TableHead>
                    <TableHead className="text-right px-6 font-bold">Net Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.memberSummaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic">
                        No members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.memberSummaries.map((m) => (
                      <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-4 px-6">
                          <div className="font-bold text-foreground">{m.name}</div>
                          <div className="text-[11px] text-muted-foreground">{m.email}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(m.totalContributed, currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="font-mono text-xs">
                            {(m.shareWeight * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-primary font-bold">
                          +{formatCurrency(m.accruedInterest, currency)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">
                          {m.currentDebt > 0 ? `-${formatCurrency(m.currentDebt, currency)}` : formatCurrency(0, currency)}
                        </TableCell>
                        <TableCell className="text-right px-6 font-bold text-base">
                          {formatCurrency(m.netBalance, currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution History Ledger Tab */}
        <TabsContent value="history">
          <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-lg">Interest Distribution Audit Ledger</CardTitle>
              <CardDescription>
                Immutable chronological log of all profit allocations executed by administrators.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead className="py-4 px-6">Execution Date</TableHead>
                    <TableHead>Reason / Justification</TableHead>
                    <TableHead className="text-right">Total Distributed</TableHead>
                    <TableHead className="text-right">Savers Benefited</TableHead>
                    <TableHead className="text-right px-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributions.length > 0 ? (
                    distributions.map((dist: any) => {
                      const dateObj = dist.distributedAt instanceof Timestamp 
                        ? dist.distributedAt.toDate() 
                        : new Date(dist.distributedAt || Date.now());
                      return (
                        <TableRow key={dist.id} className="hover:bg-muted/30">
                          <TableCell className="py-4 px-6 font-medium">
                            <div>{format(dateObj, 'PPP')}</div>
                            <div className="text-[11px] text-muted-foreground">{format(dateObj, 'p')}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">{dist.justification || 'Regular profit distribution'}</div>
                            <div className="text-[11px] text-muted-foreground">Pool at execution: {formatCurrency(dist.totalSavingsPoolAtDistribution || 0, currency)}</div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            +{formatCurrency(dist.totalDistributed, currency)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {dist.distributions?.length || 0} members
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Reconciled
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : auditLogs.filter((l: any) => l.action === 'ALLOCATE_INTEREST').length > 0 ? (
                    auditLogs.filter((l: any) => l.action === 'ALLOCATE_INTEREST').map((log: any) => {
                      const dateObj = log.timestamp instanceof Timestamp 
                        ? log.timestamp.toDate() 
                        : new Date(log.timestamp || Date.now());
                      return (
                        <TableRow key={log.id} className="hover:bg-muted/30">
                          <TableCell className="py-4 px-6 font-medium">
                            <div>{format(dateObj, 'PPP')}</div>
                            <div className="text-[11px] text-muted-foreground">{format(dateObj, 'p')}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">{log.details?.justification || 'Historical profit distribution'}</div>
                            <div className="text-[11px] text-muted-foreground">Admin: {log.performedBy || 'System'}</div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            +{formatCurrency(log.details?.totalDistributed || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {log.details?.memberDistributions?.length || 1} members
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Reconciled
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-36 text-center text-muted-foreground italic">
                        No previous profit distributions recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Smart Distribute Profit Dialog with Live Breakdown Simulator */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleAllocateInterest}>
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Distribute Realized Interest Profits
              </DialogTitle>
              <DialogDescription>
                Allocate accumulated group interest pro-rata according to each member&apos;s active savings balance.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Pool Status Information Box */}
              <div className="bg-muted/40 rounded-xl p-4 border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Available Undistributed Pool:
                  </span>
                  <span className="text-base font-bold text-emerald-600">
                    {formatCurrency(reportData.availableUndistributedInterest, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total Realized from Loans:</span>
                  <span>{formatCurrency(reportData.lifetimeRealizedInterest, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Already Distributed to Members:</span>
                  <span>{formatCurrency(reportData.lifetimeDistributedInterest, currency)}</span>
                </div>
              </div>

              {/* Amount Input with Quick Fill */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount" className="font-semibold">Total Amount to Distribute ({currency})</Label>
                  {reportData.availableUndistributedInterest > 0 && (
                    <button
                      type="button"
                      onClick={() => setDistributeAmountInput(reportData.availableUndistributedInterest.toString())}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Fill Max Available ({formatCurrency(reportData.availableUndistributedInterest, currency)})
                    </button>
                  )}
                </div>
                <Input 
                  id="amount" 
                  name="amount" 
                  type="number" 
                  min="1"
                  max={reportData.availableUndistributedInterest}
                  required 
                  placeholder="e.g. 2000"
                  value={distributeAmountInput}
                  onChange={(e) => setDistributeAmountInput(e.target.value)}
                  className={`text-lg font-semibold ${isAmountExceeded ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                
                {isAmountExceeded && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1">
                    <AlertTriangle className="h-4 w-4" />
                    Cannot distribute more than available undistributed interest ({formatCurrency(reportData.availableUndistributedInterest, currency)}).
                  </div>
                )}
                
                {reportData.availableUndistributedInterest <= 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Info className="h-4 w-4" />
                    All earned loan interest has already been distributed.
                  </div>
                )}
              </div>

              {/* Justification Textarea */}
              <div className="space-y-2">
                <Label htmlFor="justification" className="font-semibold">Audit Justification & Notes</Label>
                <Textarea 
                  id="justification" 
                  name="justification" 
                  required 
                  placeholder="e.g. Q3 2026 interest dividend distribution from fully repaid loans." 
                  value={justificationInput}
                  onChange={(e) => setJustificationInput(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Live Pre-Distribution Simulation Table */}
              {isAmountValid && simulationPreview.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Pre-Distribution Calculation Breakdown
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      Formula: Current Interest + New Share = Projected Total
                    </span>
                  </div>
                  
                  <div className="rounded-xl border border-muted overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="text-xs">
                          <TableHead className="py-2.5">Member</TableHead>
                          <TableHead className="text-right">Share %</TableHead>
                          <TableHead className="text-right">Current Accrued</TableHead>
                          <TableHead className="text-right text-emerald-600 font-bold">+ New Share</TableHead>
                          <TableHead className="text-right font-extrabold pr-4">= Projected Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {simulationPreview.map(item => (
                          <TableRow key={item.id} className="text-xs">
                            <TableCell className="py-2 font-medium">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.percentage}%</TableCell>
                            <TableCell className="text-right text-muted-foreground font-medium">
                              {formatCurrency(item.currentInterest, currency)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 font-bold">
                              +{formatCurrency(item.incomingShare, currency)}
                            </TableCell>
                            <TableCell className="text-right font-extrabold text-foreground pr-4">
                              {formatCurrency(item.projectedTotalInterest, currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isAllocating}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isAllocating || !isAmountValid || reportData.availableUndistributedInterest <= 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {isAllocating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Executing Distribution...
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Confirm & Distribute {isAmountValid ? formatCurrency(parsedDistributeAmount, currency) : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Super Admin Reset Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <form onSubmit={handleResetFinancialData}>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                <DialogTitle className="text-xl font-bold">Confirm Full Financial Reset to 0</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                This action is <strong className="text-destructive">permanent and irreversible</strong>. All contributions, active loans, debt balances, and accumulated member interest will be set to 0.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Security Verification Required
                </div>
                <p className="text-xs text-muted-foreground">
                  User accounts and login credentials will remain intact. Only the financial ledgers will be reset to a clean zero state.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reportResetJustification" className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Audit Justification (Required)
                </Label>
                <Textarea 
                  id="reportResetJustification"
                  required
                  placeholder="e.g. Official annual tontine close-out / System initialization for new cycle."
                  value={resetJustification}
                  onChange={(e) => setResetJustification(e.target.value)}
                  className="rounded-xl min-h-[70px] bg-muted border-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reportConfirmationText" className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  To confirm, type <span className="font-mono text-destructive select-all font-bold">RESET FINANCIAL DATA</span> below:
                </Label>
                <Input 
                  id="reportConfirmationText"
                  required
                  placeholder="RESET FINANCIAL DATA"
                  value={resetConfirmationText}
                  onChange={(e) => setResetConfirmationText(e.target.value)}
                  className="h-11 rounded-xl font-mono text-sm bg-muted border-none"
                  autoComplete="off"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={isResetting || resetConfirmationText.trim() !== 'RESET FINANCIAL DATA' || !resetJustification.trim()}
                className="font-bold shadow-lg"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting All Financial Data...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Wipe & Set All Financial Data to 0
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
