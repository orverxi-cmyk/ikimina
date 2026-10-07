'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Coins,
  Scale,
  History,
  PiggyBank,
  Banknote,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Filter,
  TrendingUp,
  Plus,
  Search,
  Eye,
  Loader2,
  Check,
  X,
  ArrowUpRight,
  FileText,
  Users,
  Calendar,
  AlertTriangle,
  Info,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  initiateInterestDistributionAction,
  reviewInterestDistributionAction,
  approveInterestDistributionAction,
  rejectInterestDistributionAction,
  openInterestPayoutCampaignAction,
} from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

function safeDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(val: any, fallback = '—') {
  const d = safeDate(val);
  return d ? format(d, 'dd MMM yyyy, HH:mm') : fallback;
}

function parseDateMs(val: any): number {
  if (!val) return 0;
  if (val?.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
  if (val?.seconds) return val.seconds * 1000;
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function DistributeInterestPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const [cachedRole, setCachedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  const userRole = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');
  const isSuperAdmin = userRole === 'admin' || isPrimaryAdmin;
  const isSeniorAccountant = userRole === 'senior_accountant';
  const isReviewer = userRole === 'reviewer' || userRole === 'management';
  const isAccountant = userRole === 'accountant' || userRole === 'senior_accountant';
  const isAuditor = userRole === 'auditor';

  const isAuthorized = Boolean(
    user && ['admin', 'management', 'accountant', 'senior_accountant', 'reviewer', 'auditor'].includes(userRole)
  );

  const [activeTab, setActiveTab] = useState<'proposals' | 'runs' | 'campaign'>('proposals');
  const [search, setSearch] = useState('');

  // Dialog States
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [initiateAmount, setInitiateAmount] = useState<number | ''>('');
  const [initiateJustification, setInitiateJustification] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);

  // Review & Approve Action Modal
  const [actionProposal, setActionProposal] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'review'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [isPerformingAction, setIsPerformingAction] = useState(false);

  // Breakdown Inspection Modal
  const [inspectRun, setInspectRun] = useState<any | null>(null);
  const [breakdownSearch, setBreakdownSearch] = useState('');

  // Campaign Modal
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignDurationDays, setCampaignDurationDays] = useState(7);
  const [isLaunchingCampaign, setIsLaunchingCampaign] = useState(false);

  // Subscriptions
  const membersQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'users')) : null, [firestore, isAuthorized]);
  const { data: membersSnap } = useCollection(membersQuery);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const memberMap = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);

  const getMemberName = (id: string) => (memberMap.get(id) as any)?.name || id || 'Unknown Member';

  // Interest Distribution Proposals
  const requestsQuery = useMemoFirebase(
    () => isAuthorized ? query(collection(firestore, 'interest_distribution_requests')) : null,
    [firestore, isAuthorized]
  );
  const { data: requestsSnap, loading: loadingRequests } = useCollection(requestsQuery);

  // Completed Distributions
  const distributionsQuery = useMemoFirebase(
    () => isAuthorized ? query(collection(firestore, 'interest_distributions')) : null,
    [firestore, isAuthorized]
  );
  const { data: distributionsSnap, loading: loadingDistributions } = useCollection(distributionsQuery);

  // Financial pool calculation inputs: loans, contributions, audit logs
  const loansQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'loans')) : null, [firestore, isAuthorized]);
  const { data: loansSnap } = useCollection(loansQuery);

  const contributionsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'contributions')) : null, [firestore, isAuthorized]);
  const { data: contributionsSnap } = useCollection(contributionsQuery);

  const auditLogsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'audit_logs')) : null, [firestore, isAuthorized]);
  const { data: auditLogsSnap } = useCollection(auditLogsQuery);

  // Calculate Realized Pool & Lifetime Distributed
  const poolMetrics = useMemo(() => {
    const rawLoans = loansSnap?.docs.map(d => d.data()) || [];
    const rawContributions = contributionsSnap?.docs.map(d => d.data()) || [];
    const rawLogs = auditLogsSnap?.docs.map(d => d.data()) || [];

    const totalRealizedInterest = rawLoans.reduce((acc, l: any) => {
      if (l.status === 'completed' || l.status === 'approved') {
        return acc + (Number(l.interestAmount) || 0);
      }
      return acc;
    }, 0);

    const lifetimeDistributedInterest = rawLogs.reduce((acc, log: any) => {
      if (log.action === 'ALLOCATE_INTEREST') {
        return acc + (Number(log.details?.totalDistributed) || 0);
      }
      return acc;
    }, 0);

    const availableUndistributedInterest = Math.max(0, totalRealizedInterest - lifetimeDistributedInterest);

    let totalVerifiedSavings = 0;
    const saverSet = new Set<string>();
    rawContributions.forEach((c: any) => {
      if (c.status === 'verified' || c.status === 'approved') {
        const amt = Number(c.amount) || 0;
        totalVerifiedSavings += amt;
        if (c.memberId) saverSet.add(c.memberId);
      }
    });

    return {
      totalRealizedInterest,
      lifetimeDistributedInterest,
      availableUndistributedInterest,
      totalVerifiedSavings,
      activeSaversCount: saverSet.size,
    };
  }, [loansSnap, contributionsSnap, auditLogsSnap]);

  // Parse proposals
  const allProposals = useMemo(() => {
    const raw = (requestsSnap?.docs || []).map(d => ({ id: d.id, ...d.data() as any }));
    return raw.sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt));
  }, [requestsSnap]);

  // Parse completed historical distribution runs
  const allCompletedRuns = useMemo(() => {
    const raw = (distributionsSnap?.docs || []).map(d => ({ id: d.id, ...d.data() as any }));
    return raw.sort((a, b) => parseDateMs(b.distributedAt || b.createdAt) - parseDateMs(a.distributedAt || a.createdAt));
  }, [distributionsSnap]);

  const pendingProposals = useMemo(
    () => allProposals.filter(p => ['pending', 'pending_reviewer', 'pending_approval', 'revision_requested'].includes(p.status)),
    [allProposals]
  );

  const isProposalInitiatedByCurrentUser = (prop: any) =>
    Boolean(user && prop && (prop.initiatedBy === user.uid || prop.adminId === user.uid));

  // Handle Initiate Proposal
  const handleInitiateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initiateAmount || Number(initiateAmount) <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a valid distribution amount.' });
      return;
    }
    if (Number(initiateAmount) > poolMetrics.availableUndistributedInterest) {
      toast({
        variant: 'destructive',
        title: 'Amount Exceeds Pool',
        description: `Cannot exceed available undistributed pool of ${formatCurrency(poolMetrics.availableUndistributedInterest, currency)}.`,
      });
      return;
    }
    if (!initiateJustification.trim()) {
      toast({ variant: 'destructive', title: 'Justification Required', description: 'Please provide audit justification notes.' });
      return;
    }

    setIsInitiating(true);
    try {
      await initiateInterestDistributionAction({
        totalInterestToDistribute: Number(initiateAmount),
        justification: initiateJustification.trim(),
      });
      toast({
        title: 'Distribution Proposal Initiated',
        description: `Proposal for ${formatCurrency(Number(initiateAmount), currency)} created and forwarded for compliance review.`,
      });
      setIsInitiateModalOpen(false);
      setInitiateAmount('');
      setInitiateJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: 'destructive', title: parsed.title || 'Initiation Failed', description: parsed.message });
    } finally {
      setIsInitiating(false);
    }
  };

  // Handle Action on Proposal: Review (Senior Accountant/Reviewer) or Approve (Super Admin)
  const handleSubmitAction = async (decision: 'confirm' | 'reject') => {
    if (!actionProposal || !user) return;
    if (isBrowserOffline()) {
      toast({ variant: 'destructive', title: 'Offline', description: 'Please reconnect to submit your action.' });
      return;
    }

    if (isProposalInitiatedByCurrentUser(actionProposal) && !isSeniorAccountant) {
      toast({
        variant: 'destructive',
        title: 'Segregation of Duties Violation',
        description: 'You initiated this distribution proposal. Another authorized officer must sign off.',
      });
      return;
    }

    if (!actionNotes.trim()) {
      toast({ variant: 'destructive', title: 'Notes Required', description: 'Please provide audit justification notes.' });
      return;
    }

    setIsPerformingAction(true);
    try {
      if (decision === 'confirm') {
        if (isSuperAdmin) {
          // ADMIN APPROVES
          await approveInterestDistributionAction({
            requestId: actionProposal.id,
            approvalNotes: actionNotes.trim(),
          });
          toast({
            title: 'Interest Distribution Approved & Committed',
            description: `Successfully allocated dividends to active savers and committed to official ledger.`,
          });
        } else {
          // REVIEWER REVIEWS
          await reviewInterestDistributionAction({
            requestId: actionProposal.id,
            decision: 'endorse',
            reviewNotes: actionNotes.trim(),
          });
          toast({
            title: 'Proposal Reviewed & Endorsed',
            description: 'Interest distribution proposal endorsed and forwarded for executive ratification.',
          });
        }
      } else {
        // REJECT
        if (isSuperAdmin) {
          await rejectInterestDistributionAction({
            requestId: actionProposal.id,
            rejectionReason: actionNotes.trim(),
          });
        } else {
          await reviewInterestDistributionAction({
            requestId: actionProposal.id,
            decision: 'reject',
            reviewNotes: actionNotes.trim(),
          });
        }
        toast({
          title: 'Proposal Rejected',
          description: 'Interest distribution proposal has been rejected.',
        });
      }
      setActionProposal(null);
      setActionNotes('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: 'destructive', title: parsed.title || 'Action Failed', description: parsed.message });
    } finally {
      setIsPerformingAction(false);
    }
  };

  // Handle Launch Election Campaign
  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLaunchingCampaign(true);
    try {
      await openInterestPayoutCampaignAction({
        targetAmount: poolMetrics.availableUndistributedInterest,
        announcement: `Dividend payout election window is active for ${campaignDurationDays} days. Please submit your preferred payout channel.`,
      });
      toast({
        title: 'Campaign Launched',
        description: `Member dividend payout election window is now active for ${campaignDurationDays} days.`,
      });
      setIsCampaignModalOpen(false);
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: 'destructive', title: parsed.title || 'Campaign Failed', description: parsed.message });
    } finally {
      setIsLaunchingCampaign(false);
    }
  };

  // Filtered member breakdown inside inspect dialog
  const filteredBreakdown = useMemo(() => {
    if (!inspectRun || !Array.isArray(inspectRun.breakdown)) return [];
    if (!breakdownSearch.trim()) return inspectRun.breakdown;
    const term = breakdownSearch.toLowerCase();
    return inspectRun.breakdown.filter((item: any) =>
      (item.memberName && item.memberName.toLowerCase().includes(term)) ||
      (item.name && item.name.toLowerCase().includes(term)) ||
      (item.memberEmail && item.memberEmail.toLowerCase().includes(term)) ||
      (item.memberId && item.memberId.toLowerCase().includes(term))
    );
  }, [inspectRun, breakdownSearch]);

  if (userDataLoading && !cachedRole && !isPrimaryAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center px-4">
        <div className="space-y-3 max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="font-bold text-lg text-foreground">Access Restricted</h2>
          <p className="text-xs text-muted-foreground">
            You do not have administrative or accounting permissions to access Interest Distribution.
          </p>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/dashboard">Return to Member Portal</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-24 w-full min-w-0">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              Dividend Management
            </Badge>
            {pendingProposals.length > 0 && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/30 text-[9px] font-bold">
                {pendingProposals.length} Proposal{pendingProposals.length > 1 ? 's' : ''} Awaiting Dual-Control
              </Badge>
            )}
            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-400/30 text-[9px] font-bold">
              {poolMetrics.activeSaversCount} Active Savers Eligible
            </Badge>
          </div>
          <h1 className="text-[14px] sm:text-base font-bold font-headline text-foreground flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" /> Interest Distribution & Dividend Ledger
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pro-rata allocation of realized group loan interest according to each member&apos;s verified savings weight.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isAuditor && (
            <>
              {(isAccountant || isSuperAdmin) && (
                <Button
                  onClick={() => {
                    setInitiateAmount(poolMetrics.availableUndistributedInterest > 0 ? poolMetrics.availableUndistributedInterest : '');
                    setInitiateJustification('');
                    setIsInitiateModalOpen(true);
                  }}
                  disabled={poolMetrics.availableUndistributedInterest <= 0}
                  className="rounded-xl h-10 px-4 font-bold text-xs gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Initiate Distribution Proposal
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsCampaignModalOpen(true)}
                className="rounded-xl h-10 px-3.5 font-bold text-xs gap-1.5 border-primary/20 hover:bg-primary/5"
              >
                <Play className="h-3.5 w-3.5 text-primary" /> Member Payout Campaign
              </Button>
            </>
          )}
          <Link href="/admin/approvals">
            <Button variant="secondary" className="rounded-xl h-10 px-3.5 font-bold text-xs gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Approvals Hub
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 TOP FINANCIAL KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: UNDISTRIBUTED POOL */}
        <Card className="border-none shadow-md bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl overflow-hidden relative">
          <div className="absolute -right-4 -bottom-4 opacity-15">
            <Scale className="h-32 w-32" />
          </div>
          <CardHeader className="pb-2 p-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[11px] font-bold text-blue-100 uppercase tracking-widest flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Undistributed Pool
              </CardTitle>
              <Badge className="bg-white/20 text-white border-none text-[9px] font-extrabold px-2 py-0.5">
                {poolMetrics.availableUndistributedInterest > 0 ? 'Ready to Allocate' : 'Allocated'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
            </div>
            <p className="text-[11px] text-blue-100 mt-1 font-medium">
              Net safe unallocated profit available
            </p>
          </CardContent>
        </Card>

        {/* Card 2: REALIZED LOAN INTEREST */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-white" /> Realized Loan Interest
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-xl sm:text-2xl font-extrabold text-foreground">
              {formatCurrency(poolMetrics.totalRealizedInterest, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 text-xs">
              Cumulative lifetime earnings from loans
            </p>
          </CardContent>
        </Card>

        {/* Card 3: DISTRIBUTED TO DATE */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-white" /> Distributed to Date
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-xl sm:text-2xl font-extrabold text-foreground">
              {formatCurrency(poolMetrics.lifetimeDistributedInterest, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 text-xs">
              Total dividends credited to members
            </p>
          </CardContent>
        </Card>

        {/* Card 4: ACTIVE SAVERS CAPITAL */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-white" /> Eligible Capital Base
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-xl sm:text-2xl font-extrabold text-foreground">
              {formatCurrency(poolMetrics.totalVerifiedSavings, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 text-xs">
              Across {poolMetrics.activeSaversCount} active scheme savers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TABS: PROPOSALS / HISTORICAL RUNS / POLICY INFO */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 w-full sm:w-auto h-10 p-1 bg-muted/60 rounded-xl">
            <TabsTrigger value="proposals" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
              <Clock className="h-3.5 w-3.5" /> Distribution Proposals {pendingProposals.length > 0 && `(${pendingProposals.length})`}
            </TabsTrigger>
            <TabsTrigger value="runs" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
              <History className="h-3.5 w-3.5" /> Historical Runs ({allCompletedRuns.length})
            </TabsTrigger>
            <TabsTrigger value="campaign" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold col-span-2 sm:col-span-1">
              <PiggyBank className="h-3.5 w-3.5" /> Payout Policy & Campaign
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search reference, initiator…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl text-xs bg-card"
            />
          </div>
        </div>

        {/* TAB 1: PROPOSALS & APPROVAL QUEUE */}
        <TabsContent value="proposals" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 flex flex-row items-center gap-2">
              <Clock className="h-4 w-4" />
              <CardTitle className="text-[13px] font-bold text-white">Interest Distribution Proposals Queue</CardTitle>
              <Badge className="ml-auto bg-white/20 text-white text-[10px] font-bold border-none">{allProposals.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Proposal ID</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Initiated By</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Pool Amount</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Savers</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Date</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingRequests ? (
                      <TableRow><TableCell colSpan={7} className="h-28 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : allProposals.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground italic">No interest distribution proposals recorded.</TableCell></TableRow>
                    ) : (
                      allProposals.map(prop => {
                        const isSelf = isProposalInitiatedByCurrentUser(prop);
                        return (
                          <TableRow key={prop.id} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3">
                              <div className="font-bold text-sm text-foreground">
                                {prop.period || `Proposal #${prop.id.slice(0, 8)}`}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground">{prop.id.slice(0, 12)}</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <div className="font-semibold text-foreground">{prop.initiatedByName || prop.adminName || getMemberName(prop.initiatedBy || prop.adminId)}</div>
                              {isSelf && (
                                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold mt-0.5">
                                  Initiated by you
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-sm text-primary">
                              {formatCurrency(Number(prop.totalInterestToDistribute || prop.amountDistributed) || 0, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center text-xs font-semibold">
                              {prop.recipientsCount || prop.breakdown?.length || 0}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              <Badge className={cn(
                                "text-[9px] uppercase font-bold border",
                                prop.status === 'pending_reviewer' && "bg-blue-500/10 text-blue-700 border-blue-400/30",
                                prop.status === 'pending_approval' && "bg-violet-500/10 text-violet-700 border-violet-400/30",
                                prop.status === 'approved' && "bg-green-600/10 text-green-700 border-green-500/30",
                                prop.status === 'rejected' && "bg-red-500/10 text-red-700 border-red-500/30",
                                prop.status === 'revision_requested' && "bg-orange-500/10 text-orange-700 border-orange-400/30"
                              )}>
                                {prop.status === 'pending_reviewer' ? 'Awaiting Reviewer' :
                                 prop.status === 'pending_approval' ? 'Awaiting Admin Approval' :
                                 prop.status === 'approved' ? 'Approved & Committed' : prop.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                              {formatDate(prop.createdAt)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* ADMIN APPROVES: ONLY for pending_approval. NEVER reviews! */}
                                {isSuperAdmin && prop.status === 'pending_approval' && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setActionProposal(prop);
                                      setActionType('approve');
                                      setActionNotes('');
                                    }}
                                    disabled={isSelf}
                                    className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                  >
                                    <CheckCircle2 className="h-3 w-3" /> Approve
                                  </Button>
                                )}

                                {/* REVIEWER REVIEWS: for pending_reviewer */}
                                {!isSuperAdmin && ((isReviewer && prop.status === 'pending_reviewer') || (isSeniorAccountant && prop.status === 'pending')) && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setActionProposal(prop);
                                      setActionType('review');
                                      setActionNotes('');
                                    }}
                                    disabled={isSelf && !isSeniorAccountant}
                                    className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
                                  >
                                    <Eye className="h-3 w-3" /> Review
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setInspectRun(prop);
                                    setBreakdownSearch('');
                                  }}
                                  className="h-7 px-2 rounded-lg text-xs font-bold gap-1"
                                >
                                  <Eye className="h-3.5 w-3.5" /> Details
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: HISTORICAL RUNS & SETTLED LEDGERS */}
        <TabsContent value="runs" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-emerald-600 text-white p-4 flex flex-row items-center gap-2">
              <History className="h-4 w-4" />
              <CardTitle className="text-[13px] font-bold text-white">Historical Dividend Distribution Runs</CardTitle>
              <Badge className="ml-auto bg-white/20 text-white text-[10px] font-bold border-none">{allCompletedRuns.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Run Date</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Amount Distributed</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Capitalized (Savings)</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Cash Payouts</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Recipients</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDistributions ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : allCompletedRuns.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground italic">No historical distribution runs recorded yet.</TableCell></TableRow>
                    ) : (
                      allCompletedRuns.map(run => (
                        <TableRow key={run.id} className="hover:bg-muted/30">
                          <TableCell className="px-4 py-3 font-semibold text-xs">
                            <div>{formatDate(run.distributedAt || run.createdAt)}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{run.id.slice(0, 10)}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(Number(run.amountDistributed || run.totalInterestToDistribute) || 0, currency)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-bold text-xs text-foreground">
                            {formatCurrency(Number(run.totalCapitalizedToContributions) || 0, currency)}
                            <div className="text-[10px] text-muted-foreground font-normal">{run.capitalizedCount || 0} members</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-bold text-xs text-foreground">
                            {formatCurrency(Number(run.totalCashPayout) || 0, currency)}
                            <div className="text-[10px] text-muted-foreground font-normal">{run.cashPayoutCount || 0} members</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-center text-xs font-semibold">
                            {run.recipientsCount || run.breakdown?.length || 0} savers
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setInspectRun(run);
                                setBreakdownSearch('');
                              }}
                              className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Allocations
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: PAYOUT POLICY & CAMPAIGN */}
        <TabsContent value="campaign" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-border shadow-sm rounded-2xl bg-card">
              <CardHeader className="p-5">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-primary" /> Member Payout Channel Preferences
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  By default, member dividends are reinvested directly into their verified savings. Members can also choose liquid cash payouts.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3 text-xs text-muted-foreground">
                <div className="p-3 bg-muted/40 rounded-xl space-y-1.5 border">
                  <div className="flex items-center gap-2 text-foreground font-bold">
                    <PiggyBank className="h-4 w-4 text-emerald-600" />
                    <span>Channel A: Add to Total Contribution (Reinvestment)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Automatically credits the member&apos;s verified savings balance upon distribution approval. Excluded from cash withdrawable amounts.
                  </p>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl space-y-1.5 border">
                  <div className="flex items-center gap-2 text-foreground font-bold">
                    <Banknote className="h-4 w-4 text-blue-600" />
                    <span>Channel B: Liquid Cash Payout</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Credited as liquid withdrawable interest, available for direct payout or mobile money disbursement.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm rounded-2xl bg-card">
              <CardHeader className="p-5">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" /> Launch Preference Election Campaign
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Open an active voting campaign allowing members to submit their payout election choices before a scheduled distribution run.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1 text-xs">
                  <p className="font-bold text-foreground">Current Available Pool:</p>
                  <p className="text-lg font-extrabold text-primary">
                    {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Available for upcoming election cycle across {poolMetrics.activeSaversCount} active savers.
                  </p>
                </div>

                {!isAuditor && (
                  <Button
                    onClick={() => setIsCampaignModalOpen(true)}
                    className="w-full rounded-xl font-bold text-xs h-10 gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    <Play className="h-4 w-4" /> Open Campaign Window
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* INITIATE DISTRIBUTION PROPOSAL MODAL */}
      <Dialog open={isInitiateModalOpen} onOpenChange={setIsInitiateModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Coins className="h-4 w-4 text-primary" /> Initiate Interest Distribution Proposal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dual-control Step 1: Accountant calculates and submits proposal for compliance review.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInitiateProposal} className="space-y-4 text-xs py-2">
            <div className="p-3 bg-muted/40 rounded-xl border border-border/50 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Available Pool Ceiling</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground">Eligible Savers</span>
                <span className="font-semibold text-foreground">{poolMetrics.activeSaversCount} members</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Distribution Amount ({currency}) *
              </Label>
              <Input
                type="number"
                min={1}
                max={poolMetrics.availableUndistributedInterest}
                value={initiateAmount}
                onChange={e => setInitiateAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={`e.g. ${poolMetrics.availableUndistributedInterest}`}
                className="text-xs rounded-xl h-10"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Audit Justification / Board Resolution *
              </Label>
              <Textarea
                placeholder="e.g. Dividend allocation for Q3 2026 authorized per AGM resolution #4."
                value={initiateJustification}
                onChange={e => setInitiateJustification(e.target.value)}
                className="text-xs rounded-xl min-h-[70px]"
                required
              />
            </div>

            <DialogFooter className="gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsInitiateModalOpen(false)} className="rounded-xl font-semibold">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isInitiating}
                className="rounded-xl font-bold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 gap-1.5"
              >
                {isInitiating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Submit Proposal for Review
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DUAL-CONTROL ACTION MODAL (REVIEW OR APPROVE) */}
      <Dialog open={!!actionProposal} onOpenChange={open => !open && setActionProposal(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              {isSuperAdmin ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Executive Ratification — Interest Distribution
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 text-primary" />
                  Compliance Review — Interest Distribution
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isSuperAdmin
                ? 'Step 3: Executive sign-off to allocate dividends and commit to official member ledgers.'
                : 'Step 2: Inspect pro-rata shares and endorse proposal for executive approval.'}
            </DialogDescription>
          </DialogHeader>

          {actionProposal && (
            <div className="space-y-4 text-xs py-2">
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Proposal Reference</span>
                  <span className="font-bold text-foreground">{actionProposal.id.slice(0, 12)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Amount to Distribute</span>
                  <span className="font-bold text-emerald-600 text-sm">
                    {formatCurrency(Number(actionProposal.totalInterestToDistribute) || 0, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Initiated By</span>
                  <span className="text-foreground">
                    {actionProposal.initiatedByName || getMemberName(actionProposal.initiatedBy)}
                  </span>
                </div>
                {actionProposal.justification && (
                  <div className="pt-1 border-t border-border/40 text-muted-foreground italic">
                    &ldquo;{actionProposal.justification}&rdquo;
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {isSuperAdmin ? 'Approval Justification Notes (Required) *' : 'Review Audit Notes (Required) *'}
                </Label>
                <Textarea
                  placeholder={
                    isSuperAdmin
                      ? 'e.g. Ratified per dual-control bylaws, authorized to credit ledgers.'
                      : 'e.g. Verified pro-rata calculations against verified savings, endorsed.'
                  }
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  className="text-xs rounded-xl min-h-[70px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setActionProposal(null)} className="rounded-xl font-semibold">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPerformingAction}
              onClick={() => handleSubmitAction('reject')}
              className="rounded-xl text-xs font-bold gap-1"
            >
              <X className="h-3.5 w-3.5" /> Reject Proposal
            </Button>
            <Button
              size="sm"
              disabled={isPerformingAction}
              onClick={() => handleSubmitAction('confirm')}
              className={cn(
                "rounded-xl text-xs font-bold gap-1 text-white shadow-sm",
                isSuperAdmin ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90"
              )}
            >
              {isPerformingAction ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSuperAdmin ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {isSuperAdmin ? 'Approve & Commit to Ledger' : 'Endorse & Forward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MEMBER BREAKDOWN INSPECTION MODAL */}
      <Dialog open={!!inspectRun} onOpenChange={open => !open && setInspectRun(null)}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] flex flex-col rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Coins className="h-4 w-4 text-primary" />
              Interest Distribution Run Breakdown
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Total Pool: {formatCurrency(Number(inspectRun?.amountDistributed || inspectRun?.totalInterestToDistribute) || 0, currency)} &bull; {inspectRun?.recipientsCount || inspectRun?.breakdown?.length || 0} active savers
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Split breakdown summary chips */}
            {(inspectRun?.totalCapitalizedToContributions > 0 || inspectRun?.totalCashPayout > 0) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold mb-0.5">
                    <PiggyBank className="h-3.5 w-3.5" /> Reinvested to Savings
                  </div>
                  <div className="text-base font-extrabold text-foreground">
                    {formatCurrency(inspectRun.totalCapitalizedToContributions, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {inspectRun.capitalizedCount || 0} members credited with verified savings
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-0.5">
                    <Banknote className="h-3.5 w-3.5" /> Liquid Cash Payouts
                  </div>
                  <div className="text-base font-extrabold text-foreground">
                    {formatCurrency(inspectRun.totalCashPayout, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {inspectRun.cashPayoutCount || 0} members credited with withdrawable interest
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search recipient member by name or email…"
                value={breakdownSearch}
                onChange={e => setBreakdownSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader className="bg-blue-600 text-white">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="py-2.5 px-3 text-white font-bold text-xs">Recipient Member</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Savings at Run</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Share Ratio</TableHead>
                    <TableHead className="text-center text-white font-bold text-xs">Payout Channel</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs text-emerald-200">Dividend Credited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBreakdown.length > 0 ? (
                    filteredBreakdown.map((b: any, idx: number) => (
                      <TableRow key={b.memberId || idx} className="text-xs hover:bg-muted/30">
                        <TableCell className="py-2.5 px-3 font-semibold">
                          {b.memberName || b.name || b.memberEmail || b.memberId}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(b.contributions || b.savings || 0), currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-primary font-bold">
                          {b.shareRatio ? `${(b.shareRatio * 100).toFixed(2)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {b.payoutType === 'cash_payout' ? (
                            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-none font-bold text-[9px] gap-1 py-0.5">
                              <Banknote className="h-3 w-3" /> Cash Payout
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none font-bold text-[9px] gap-1 py-0.5">
                              <PiggyBank className="h-3 w-3" /> To Savings
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(Number(b.distributedShare || b.share || 0), currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-xs italic">
                        {inspectRun?.breakdown ? 'No matching members found.' : 'Detailed breakdown not stored for this record.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInspectRun(null)} className="rounded-xl font-bold">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CAMPAIGN MODAL */}
      <Dialog open={isCampaignModalOpen} onOpenChange={setIsCampaignModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Play className="h-4 w-4 text-primary" /> Launch Dividend Payout Election Campaign
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Open a voting window for members to choose between savings reinvestment or liquid cash payout.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLaunchCampaign} className="space-y-4 text-xs py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Campaign Duration (Days)
              </Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={campaignDurationDays}
                onChange={e => setCampaignDurationDays(Number(e.target.value))}
                className="text-xs rounded-xl h-10"
                required
              />
            </div>

            <div className="p-3 bg-muted/40 rounded-xl space-y-1 text-muted-foreground text-[11px]">
              <p className="font-bold text-foreground">Active Pool to Distribute:</p>
              <p className="text-primary font-bold text-sm">
                {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
              </p>
              <p>Members can submit their preference from their dashboard throughout this voting window.</p>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCampaignModalOpen(false)} className="rounded-xl font-semibold">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isLaunchingCampaign}
                className="rounded-xl font-bold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 gap-1.5"
              >
                {isLaunchingCampaign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Launch Campaign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
