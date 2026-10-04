'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  Scale,
  ShieldCheck,
  History,
  Users,
  Wallet,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Sparkles,
  Search,
  FileSpreadsheet,
  Coins,
  Loader2,
  Eye,
  Check,
  HelpCircle,
  PiggyBank,
  Banknote,
  Megaphone,
  ArrowRightLeft,
  Radio,
  StopCircle,
  Play
} from "lucide-react";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  allocateInterestAction,
  openInterestPayoutCampaignAction,
  closeInterestPayoutCampaignAction,
  setMemberPayoutPreferenceAction
} from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function DistributeInterestPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';
  const { toast } = useToast();

  // Authentication & Access Control
  const currentUserRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: currentUserData, loading: userLoading } = useDoc(currentUserRef);
  const currentRole = currentUserData?.role || 'member';
  const isSuperAdmin = currentRole === 'admin';

  // Form State
  const [distributeAmountInput, setDistributeAmountInput] = useState<string>('');
  const [justificationInput, setJustificationInput] = useState<string>('');
  const [isAllocating, setIsAllocating] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);

  // Search & Filter State
  const [memberSearchTerm, setMemberSearchTerm] = useState<string>('');
  const [historySearchTerm, setHistorySearchTerm] = useState<string>('');
  const [selectedLedgerItem, setSelectedLedgerItem] = useState<any | null>(null);

  // Campaign & Preference Management State
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState<boolean>(false);
  const [campaignAnnouncementInput, setCampaignAnnouncementInput] = useState<string>('');
  const [campaignTargetAmountInput, setCampaignTargetAmountInput] = useState<string>('');
  const [isLaunchingCampaign, setIsLaunchingCampaign] = useState<boolean>(false);
  const [isClosingCampaign, setIsClosingCampaign] = useState<boolean>(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const campaign = settings.payoutCampaign;
  const isCampaignOpen = campaign?.status === 'open';

  // 1. Data Subscriptions
  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), [firestore]);
  const { data: membersSnap, loading: membersLoading } = useCollection(membersQuery);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [], [membersSnap]);

  const contributionsQuery = useMemoFirebase(() => query(collection(firestore, 'contributions')), [firestore]);
  const { data: contributionsSnap, loading: contributionsLoading } = useCollection(contributionsQuery);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [], [contributionsSnap]);

  const loansQuery = useMemoFirebase(() => query(collection(firestore, 'loans')), [firestore]);
  const { data: loansSnap, loading: loansLoading } = useCollection(loansQuery);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [], [loansSnap]);

  const distributionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'interest_distributions'), orderBy('distributedAt', 'desc')),
    [firestore]
  );
  const { data: distributionsSnap, loading: distributionsLoading } = useCollection(distributionsQuery);
  const distributions = useMemo(
    () => distributionsSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [],
    [distributionsSnap]
  );

  const auditLogsQuery = useMemoFirebase(
    () => query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')),
    [firestore]
  );
  const { data: auditLogsSnap, loading: auditLoading } = useCollection(auditLogsQuery);
  const auditLogs = useMemo(
    () => auditLogsSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [],
    [auditLogsSnap]
  );

  // 2. Authoritative Pool & Member Metrics
  const poolMetrics = useMemo(() => {
    // Total realized interest from loans
    const totalRealizedInterest = loans.reduce((acc, l: any) => {
      if (l.status === 'completed' || l.status === 'approved') {
        return acc + (Number(l.interestAmount) || 0);
      }
      return acc;
    }, 0);

    // Lifetime distributed interest from audit logs
    const lifetimeDistributedInterest = auditLogs.reduce((acc, log: any) => {
      if (log.action === 'ALLOCATE_INTEREST') {
        return acc + (Number(log.details?.totalDistributed) || 0);
      }
      return acc;
    }, 0);

    // Safe net undistributed interest ready for distribution
    const availableUndistributedInterest = Math.max(0, totalRealizedInterest - lifetimeDistributedInterest);

    // Total verified savings capital base
    const memberSavingsMap: Record<string, number> = {};
    let totalVerifiedSavings = 0;

    contributions.forEach((c: any) => {
      if (c.status === 'verified') {
        const amt = Number(c.amount) || 0;
        memberSavingsMap[c.memberId] = (memberSavingsMap[c.memberId] || 0) + amt;
        totalVerifiedSavings += amt;
      }
    });

    // Savers list with verified positive savings and preference tracking
    const activeSavers = members
      .map(m => {
        const contributed = memberSavingsMap[m.id] || 0;
        const accrued = Number(m.accruedInterest) || 0;
        const shareFraction = totalVerifiedSavings > 0 ? contributed / totalVerifiedSavings : 0;
        const preference: 'add_to_contribution' | 'receive_payout' =
          m.interestPayoutPreference === 'add_to_contribution' ? 'add_to_contribution' : 'receive_payout';

        return {
          id: m.id,
          name: m.name || m.email || 'Unnamed Member',
          email: m.email || '',
          contributed,
          accruedInterest: accrued,
          shareFraction,
          sharePercentage: (shareFraction * 100).toFixed(2),
          preference,
        };
      })
      .filter(m => m.contributed > 0);

    const capitalizedSaversCount = activeSavers.filter(s => s.preference === 'add_to_contribution').length;
    const cashPayoutSaversCount = activeSavers.filter(s => s.preference === 'receive_payout').length;

    return {
      totalRealizedInterest,
      lifetimeDistributedInterest,
      availableUndistributedInterest,
      totalVerifiedSavings,
      activeSaversCount: activeSavers.length,
      capitalizedSaversCount,
      cashPayoutSaversCount,
      activeSavers,
    };
  }, [loans, auditLogs, contributions, members]);

  // 3. Pro-Rata Allocation Calculations
  const parsedDistributeAmount = Number(distributeAmountInput) || 0;
  const isAmountValid = parsedDistributeAmount > 0 && parsedDistributeAmount <= poolMetrics.availableUndistributedInterest;
  const isAmountExceeded = parsedDistributeAmount > poolMetrics.availableUndistributedInterest;

  const allocationPreview = useMemo(() => {
    if (parsedDistributeAmount <= 0 || poolMetrics.totalVerifiedSavings <= 0) return [];

    return poolMetrics.activeSavers.map(saver => {
      const incomingShare = Math.round(saver.shareFraction * parsedDistributeAmount);
      const isReinvest = saver.preference === 'add_to_contribution';
      const projectedTotal = saver.accruedInterest + (isReinvest ? 0 : incomingShare);
      const projectedSavings = saver.contributed + (isReinvest ? incomingShare : 0);

      return {
        ...saver,
        incomingShare,
        projectedTotal,
        projectedSavings,
      };
    });
  }, [parsedDistributeAmount, poolMetrics.totalVerifiedSavings, poolMetrics.activeSavers]);

  const allocationSplit = useMemo(() => {
    let totalCapitalized = 0;
    let totalCashPayout = 0;
    let capitalizedCount = 0;
    let cashPayoutCount = 0;

    allocationPreview.forEach(s => {
      if (s.preference === 'add_to_contribution') {
        totalCapitalized += s.incomingShare;
        capitalizedCount++;
      } else {
        totalCashPayout += s.incomingShare;
        cashPayoutCount++;
      }
    });

    return { totalCapitalized, totalCashPayout, capitalizedCount, cashPayoutCount };
  }, [allocationPreview]);

  // Campaign Handlers
  const handleOpenCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isSuperAdmin) return;
    setIsLaunchingCampaign(true);
    try {
      const targetAmount = campaignTargetAmountInput ? Number(campaignTargetAmountInput) : undefined;
      await openInterestPayoutCampaignAction({
        targetAmount,
        announcement: campaignAnnouncementInput.trim() || undefined,
      });
      toast({
        title: "Member Payout Request Initiated",
        description: "Members have been notified in the app to select their payout preference.",
      });
      setIsLaunchModalOpen(false);
      setCampaignAnnouncementInput('');
      setCampaignTargetAmountInput('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Failed to Launch Request",
        description: parsed.message,
      });
    } finally {
      setIsLaunchingCampaign(false);
    }
  };

  const handleCloseCampaign = async () => {
    if (!user || !isSuperAdmin) return;
    setIsClosingCampaign(true);
    try {
      await closeInterestPayoutCampaignAction();
      toast({
        title: "Payout Request Closed",
        description: "The member payout election window is now closed. You can proceed with distribution.",
      });
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Failed to Close Request",
        description: parsed.message,
      });
    } finally {
      setIsClosingCampaign(false);
    }
  };

  const handleToggleMemberPreference = async (memberId: string, currentPreference: 'add_to_contribution' | 'receive_payout') => {
    if (!user || !isSuperAdmin) return;
    const newPreference = currentPreference === 'add_to_contribution' ? 'receive_payout' : 'add_to_contribution';
    setUpdatingMemberId(memberId);
    try {
      await setMemberPayoutPreferenceAction(newPreference, memberId);
      toast({
        title: "Preference Updated",
        description: `Member preference switched to ${newPreference === 'add_to_contribution' ? 'Add to Contribution' : 'Cash Payout'}.`,
      });
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: parsed.message,
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const filteredAllocation = useMemo(() => {
    if (!memberSearchTerm.trim()) return allocationPreview;
    const term = memberSearchTerm.toLowerCase();
    return allocationPreview.filter(
      item => item.name.toLowerCase().includes(term) || item.email.toLowerCase().includes(term)
    );
  }, [allocationPreview, memberSearchTerm]);

  // Quick fill percentages
  const handleQuickFill = (percentage: number) => {
    if (poolMetrics.availableUndistributedInterest <= 0) return;
    const amount = Math.floor((poolMetrics.availableUndistributedInterest * percentage) / 100);
    setDistributeAmountInput(amount.toString());
  };

  // 4. Submit & Execution
  const handleInitiateDistribution = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSuperAdmin) {
      toast({
        variant: "destructive",
        title: "Access Restricted",
        description: "Only Administrators are authorized to allocate group interest dividends.",
      });
      return;
    }

    if (parsedDistributeAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please specify a positive dividend amount to distribute.",
      });
      return;
    }

    if (parsedDistributeAmount > poolMetrics.availableUndistributedInterest) {
      toast({
        variant: "destructive",
        title: "Exceeds Available Pool",
        description: `Cannot allocate more than ${formatCurrency(poolMetrics.availableUndistributedInterest, currency)} of undistributed profit.`,
      });
      return;
    }

    if (!justificationInput.trim()) {
      toast({
        variant: "destructive",
        title: "Audit Justification Required",
        description: "Please document the justification or resolution notes for this distribution run.",
      });
      return;
    }

    // Open confirmation modal
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDistribution = async () => {
    if (!user || !isSuperAdmin) return;

    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently offline. Please reconnect before distributing funds.",
      });
      return;
    }

    setIsAllocating(true);
    try {
      await allocateInterestAction(user.uid, {
        totalInterestToDistribute: parsedDistributeAmount,
        justification: justificationInput.trim(),
      });

      toast({
        title: "Interest Distributed Successfully",
        description: `Successfully allocated ${formatCurrency(parsedDistributeAmount, currency)} pro-rata to ${poolMetrics.activeSaversCount} active savers.`,
      });

      setIsConfirmModalOpen(false);
      setDistributeAmountInput('');
      setJustificationInput('');
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({
        variant: "destructive",
        title: parsed.title || "Distribution Failed",
        description: parsed.message,
      });
    } finally {
      setIsAllocating(false);
    }
  };

  // Combined ledger list (interest_distributions primary, audit_logs fallback)
  const combinedLedger = useMemo(() => {
    if (distributions.length > 0) {
      return distributions.map(d => {
        const dateObj =
          d.distributedAt instanceof Timestamp
            ? d.distributedAt.toDate()
            : new Date(d.distributedAt || Date.now());
        return {
          id: d.id,
          date: dateObj,
          justification: d.justification || 'Interest profit distribution',
          amount: Number(d.amountDistributed || d.totalDistributed || 0),
          recipientsCount: d.recipientsCount || d.breakdown?.length || 0,
          totalPool: d.totalPool || 0,
          breakdown: d.breakdown || [],
          admin: d.adminId || 'Admin',
          capitalizedCount: d.capitalizedCount || 0,
          cashPayoutCount: d.cashPayoutCount || 0,
          totalCapitalizedToContributions: d.totalCapitalizedToContributions || 0,
          totalCashPayout: d.totalCashPayout || 0,
          source: 'ledger',
        };
      });
    }

    // Fallback to audit logs if interest_distributions hasn't been backfilled
    return auditLogs
      .filter((l: any) => l.action === 'ALLOCATE_INTEREST')
      .map(l => {
        const dateObj =
          l.timestamp instanceof Timestamp ? l.timestamp.toDate() : new Date(l.timestamp || Date.now());
        return {
          id: l.id,
          date: dateObj,
          justification: l.justification || l.details?.justification || 'Historical profit distribution',
          amount: Number(l.details?.totalDistributed || 0),
          recipientsCount: l.details?.recipientsCount || l.details?.memberDistributions?.length || 0,
          totalPool: l.details?.totalPool || 0,
          breakdown: l.details?.breakdown || l.details?.memberDistributions || [],
          admin: l.performedBy || l.adminId || 'System',
          capitalizedCount: l.details?.capitalizedCount || 0,
          cashPayoutCount: l.details?.cashPayoutCount || 0,
          totalCapitalizedToContributions: l.details?.totalCapitalizedToContributions || 0,
          totalCashPayout: l.details?.totalCashPayout || 0,
          source: 'audit',
        };
      });
  }, [distributions, auditLogs]);

  const filteredLedger = useMemo(() => {
    if (!historySearchTerm.trim()) return combinedLedger;
    const term = historySearchTerm.toLowerCase();
    return combinedLedger.filter(
      item =>
        item.justification.toLowerCase().includes(term) ||
        item.admin.toLowerCase().includes(term)
    );
  }, [combinedLedger, historySearchTerm]);

  const isLoading = userLoading || membersLoading || contributionsLoading || loansLoading || distributionsLoading;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] p-8 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground animate-pulse">
          Loading institutional interest ledger &amp; pool metrics...
        </p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[450px] p-6 text-center space-y-4">
        <div className="p-4 bg-destructive/10 rounded-full text-destructive">
          <AlertTriangle className="h-10 w-10" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-xl font-bold text-foreground">Administrator Access Required</h2>
          <p className="text-sm text-muted-foreground">
            Interest profit distribution and pro-rata dividend allocations can only be executed by authorized system administrators.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl font-bold">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Admin Console
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full pb-16">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-xl font-bold text-xs gap-1.5 hover:bg-muted -ml-2 text-muted-foreground"
            >
              <Link href="/admin">
                <ArrowLeft className="h-3.5 w-3.5" /> Admin Console
              </Link>
            </Button>
            <span className="text-muted-foreground">/</span>
            <Badge className="bg-blue-600/10 text-blue-700 dark:text-blue-400 border-none text-[10px] font-bold">
              Dividends &amp; Profits
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-headline tracking-tight text-foreground flex items-center gap-2.5">
            <TrendingUp className="h-7 w-7 text-primary" />
            Distribute Interest
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-2xl">
            Allocate realized group loan interest pro-rata according to each member&apos;s verified savings weight. All allocations are audited and reconciled permanently in the financial ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-2 h-9">
            <Link href="/reports">
              <FileSpreadsheet className="h-4 w-4" /> View Full Financial Report
            </Link>
          </Button>
        </div>
      </div>

      {/* Institutional Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Undistributed Pool (Highlighted) */}
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
                {poolMetrics.availableUndistributedInterest > 0 ? "Ready to Share" : "Allocated"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
            </div>
            <p className="text-[11px] text-blue-100 mt-1 font-medium">
              Net safe unallocated profit available
            </p>
          </CardContent>
        </Card>

        {/* Total Realized Interest */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-white" /> Realized Loan Interest
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(poolMetrics.totalRealizedInterest, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Cumulative lifetime earnings from loans
            </p>
          </CardContent>
        </Card>

        {/* Previously Distributed */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-white" /> Distributed to Date
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(poolMetrics.lifetimeDistributedInterest, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Historical payouts credited to savers
            </p>
          </CardContent>
        </Card>

        {/* Verified Savings Capital Base */}
        <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
            <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-white" /> Verified Capital Base
            </p>
          </div>
          <CardContent className="p-5">
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(poolMetrics.totalVerifiedSavings, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Across {poolMetrics.activeSaversCount} active eligible savers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs: Distribution Execution Console vs Historical Ledger */}
      <Tabs defaultValue="execute" className="w-full space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 bg-muted p-1 rounded-xl h-11 border border-border/60 gap-1">
            <TabsTrigger value="execute" className="rounded-lg font-bold text-xs gap-2 px-4 sm:px-5 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <TrendingUp className="h-4 w-4 text-primary" /> Execute New Distribution
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg font-bold text-xs gap-2 px-4 sm:px-5 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <History className="h-4 w-4 text-primary" /> Distribution Audit Ledger ({combinedLedger.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Execution & Allocation Preview */}
        <TabsContent value="execute" className="space-y-6">
          {/* Member Payout Request Campaign Hub */}
          <Card className={cn(
            "border-2 rounded-2xl overflow-hidden shadow-md transition-all",
            isCampaignOpen
              ? "border-primary bg-gradient-to-r from-primary/10 via-background to-blue-500/10"
              : "border-border/80 bg-card"
          )}>
            <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {isCampaignOpen ? (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] tracking-wide uppercase px-2.5 py-1 gap-1.5 flex items-center">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                      </span>
                      Member Payout Poll Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground font-bold text-[10px] tracking-wide uppercase px-2.5 py-1">
                      Election Polling Inactive
                    </Badge>
                  )}
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Megaphone className="h-3.5 w-3.5 text-primary" /> Member Payout Election Request
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground">
                    {isCampaignOpen ? "Members Are Actively Selecting Payout Preferences" : "Initiate Member Payout Request Window"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-2xl mt-0.5 leading-relaxed">
                    {isCampaignOpen
                      ? (campaign?.announcement || "An election window is currently open in the member app. Members are choosing between adding interest to their total contribution or receiving cash payouts.")
                      : "Before executing a distribution run, send an in-app request to all members so they can choose between reinvesting interest into their savings (capitalized) or receiving cash."}
                  </p>
                </div>

                {/* Polling Statistics Counter */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground font-medium">Eligible Savers:</span>
                    <span className="font-bold text-foreground">{poolMetrics.activeSaversCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <PiggyBank className="h-3.5 w-3.5" />
                    <span className="font-medium">To Contribution:</span>
                    <span className="font-bold">{poolMetrics.capitalizedSaversCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 text-blue-700 dark:text-blue-400">
                    <Banknote className="h-3.5 w-3.5" />
                    <span className="font-medium">Cash Payout:</span>
                    <span className="font-bold">{poolMetrics.cashPayoutSaversCount}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                {isCampaignOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isClosingCampaign}
                    onClick={handleCloseCampaign}
                    className="h-10 rounded-xl font-bold text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    {isClosingCampaign ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <StopCircle className="h-3.5 w-3.5" />
                    )}
                    Close Election Window
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (poolMetrics.availableUndistributedInterest > 0) {
                        setCampaignTargetAmountInput(poolMetrics.availableUndistributedInterest.toString());
                      }
                      setIsLaunchModalOpen(true);
                    }}
                    className="h-10 rounded-xl font-bold text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Initiate Member Payout Request
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Distribution Parameters Form */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
                <CardHeader className="bg-blue-600 text-white border-b border-blue-700/60 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> Allocation Configuration
                      </CardTitle>
                      <CardDescription className="text-blue-100 text-xs mt-0.5">
                        Set the total profit amount to be credited pro-rata.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-5">
                  <form onSubmit={handleInitiateDistribution} className="space-y-5" id="distribute-form">
                    {/* Amount Input with Quick-Fills */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="amount" className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Distribution Amount ({currency})
                        </Label>
                        {poolMetrics.availableUndistributedInterest > 0 && (
                          <span className="text-[11px] font-bold text-primary">
                            Max: {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
                          </span>
                        )}
                      </div>

                      <Input
                        id="amount"
                        type="number"
                        min="1"
                        max={poolMetrics.availableUndistributedInterest}
                        step="1"
                        required
                        disabled={poolMetrics.availableUndistributedInterest <= 0 || isAllocating}
                        placeholder={`e.g. ${poolMetrics.availableUndistributedInterest > 0 ? Math.min(100000, poolMetrics.availableUndistributedInterest) : 0}`}
                        value={distributeAmountInput}
                        onChange={(e) => setDistributeAmountInput(e.target.value)}
                        className={`h-12 rounded-xl text-lg font-bold bg-muted/40 border-2 ${
                          isAmountExceeded
                            ? 'border-destructive text-destructive focus-visible:ring-destructive'
                            : isAmountValid
                            ? 'border-green-600/50'
                            : ''
                        }`}
                      />

                      {/* Quick Fill Buttons */}
                      {poolMetrics.availableUndistributedInterest > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground mr-1">Quick Fill:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(100)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50 text-primary border-primary/30"
                          >
                            100% ({formatCurrency(poolMetrics.availableUndistributedInterest, currency)})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(50)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50"
                          >
                            50% ({formatCurrency(Math.floor(poolMetrics.availableUndistributedInterest * 0.5), currency)})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(25)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50"
                          >
                            25% ({formatCurrency(Math.floor(poolMetrics.availableUndistributedInterest * 0.25), currency)})
                          </Button>
                        </div>
                      )}

                      {/* Error & Status notices */}
                      {isAmountExceeded && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-bold flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p>Amount exceeds available undistributed pool.</p>
                            <p className="text-[11px] font-normal opacity-90 mt-0.5">
                              The maximum unallocated profit currently available to share is {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}.
                            </p>
                          </div>
                        </div>
                      )}

                      {poolMetrics.availableUndistributedInterest <= 0 && (
                        <div className="p-3 bg-muted rounded-xl text-xs text-muted-foreground flex items-center gap-2">
                          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>All realized loan interests have already been distributed to members.</span>
                        </div>
                      )}
                    </div>

                    {/* Audit Justification */}
                    <div className="space-y-2">
                      <Label htmlFor="justification" className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Audit Justification &amp; Resolution Notes <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="justification"
                        required
                        disabled={poolMetrics.availableUndistributedInterest <= 0 || isAllocating}
                        placeholder="e.g. Q3 2026 interest dividend allocation approved by executive committee for fully repaid cooperative loans."
                        value={justificationInput}
                        onChange={(e) => setJustificationInput(e.target.value)}
                        rows={3}
                        className="rounded-xl text-xs bg-muted/40"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        This note will be permanently logged in the Immutable Audit Trail and attached to all member ledger statements.
                      </p>
                    </div>

                    {/* Submit Action */}
                    <Button
                      type="submit"
                      disabled={!isAmountValid || !justificationInput.trim() || isAllocating}
                      className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all gap-2"
                    >
                      {isAllocating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Distributing...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Review &amp; Distribute {isAmountValid ? formatCurrency(parsedDistributeAmount, currency) : 'Profits'}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Informative Guidance Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <HelpCircle className="h-4 w-4" /> Two Payout Channels
                </div>
                
                <div className="space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-foreground font-semibold">Add to Total Contribution (Reinvestment):</strong>{' '}
                      Excluded from cash payouts. Directly creates a verified contribution savings record, boosting the member's savings and future loan qualification multiplier.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-foreground font-semibold">Receive Cash Payout:</strong>{' '}
                      Directly credits the member's liquid accrued interest balance for cash disbursement.
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-primary/10 space-y-1.5">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                    Calculation Formula
                  </div>
                  <div className="bg-background border border-border/80 rounded-xl p-3 shadow-xs">
                    <div className="text-xs font-mono font-medium text-foreground flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="text-primary font-semibold">Member Share</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-medium">
                        (Member Savings &divide; Total Savings)
                      </span>
                      <span className="text-muted-foreground">&times;</span>
                      <span className="font-semibold text-foreground">Total Dividend</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Allocation Preview Table */}
            <div className="lg:col-span-7 space-y-6">
              <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden flex flex-col h-full">
                <CardHeader className="bg-blue-600 text-white border-b border-blue-700/60 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                        <Users className="h-4 w-4" /> Dividend Allocation Preview
                      </CardTitle>
                      <CardDescription className="text-blue-100 text-xs mt-0.5">
                        {isAmountValid
                          ? `Projected breakdown for ${formatCurrency(parsedDistributeAmount, currency)} across ${poolMetrics.activeSaversCount} savers.`
                          : 'Enter an amount on the left to preview the exact allocation for each saver.'}
                      </CardDescription>
                    </div>

                    {isAmountValid && (
                      <Badge className="bg-white/20 text-white border-none text-[10px] font-bold px-2.5 py-1 shrink-0 self-start sm:self-auto">
                        Total: {formatCurrency(parsedDistributeAmount, currency)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter members in preview..."
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      className="pl-8 h-8 rounded-lg text-xs bg-background"
                    />
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    Showing {filteredAllocation.length} of {poolMetrics.activeSaversCount} savers
                  </div>
                </div>

                <CardContent className="p-0 flex-1 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-blue-600/90 text-white">
                      <TableRow className="border-none hover:bg-transparent">
                        <TableHead className="text-white font-bold text-xs py-3 px-4">Member Saver</TableHead>
                        <TableHead className="text-white font-bold text-xs text-right">Savings</TableHead>
                        <TableHead className="text-white font-bold text-xs text-right">Share %</TableHead>
                        <TableHead className="text-white font-bold text-xs text-right text-emerald-200">+ Dividend</TableHead>
                        <TableHead className="text-white font-bold text-xs text-center">Payout Election</TableHead>
                        <TableHead className="text-white font-bold text-xs text-right pr-4">Projected Position</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAllocation.length > 0 ? (
                        filteredAllocation.map((saver) => (
                          <TableRow key={saver.id} className="hover:bg-muted/30 text-xs">
                            <TableCell className="py-3 px-4 font-semibold">
                              <div>{saver.name}</div>
                              {saver.email && (
                                <div className="text-[10px] text-muted-foreground font-normal">{saver.email}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(saver.contributed, currency)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-primary font-bold">
                              {saver.sharePercentage}%
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-bold">
                              +{formatCurrency(saver.incomingShare, currency)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {saver.preference === 'add_to_contribution' ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none font-bold text-[10px] gap-1 py-0.5">
                                    <PiggyBank className="h-3 w-3" /> To Contribution
                                  </Badge>
                                ) : (
                                  <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-none font-bold text-[10px] gap-1 py-0.5">
                                    <Banknote className="h-3 w-3" /> Cash Payout
                                  </Badge>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={updatingMemberId === saver.id}
                                  onClick={() => handleToggleMemberPreference(saver.id, saver.preference)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                                  title="Switch payout method for member"
                                >
                                  {updatingMemberId === saver.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                  ) : (
                                    <ArrowRightLeft className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground pr-4">
                              {saver.preference === 'add_to_contribution' ? (
                                <div>
                                  <div className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                    {formatCurrency(saver.projectedSavings, currency)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-normal">Savings (Capitalized)</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="text-blue-600 dark:text-blue-400 font-extrabold">
                                    {formatCurrency(saver.projectedTotal, currency)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-normal">Accrued (Withdrawable)</div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="h-44 text-center text-muted-foreground text-xs italic">
                            {parsedDistributeAmount <= 0
                              ? "Enter a valid amount above 0 in the form to preview the live pro-rata breakdown."
                              : "No members match your search criteria."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>

                {isAmountValid && (
                  <CardFooter className="bg-muted/40 border-t border-border/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                        <PiggyBank className="h-3.5 w-3.5" />
                        <span>Capitalized into Savings:</span>
                        <span>{formatCurrency(allocationSplit.totalCapitalized, currency)} ({allocationSplit.capitalizedCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold">
                        <Banknote className="h-3.5 w-3.5" />
                        <span>Liquid Cash Payout:</span>
                        <span>{formatCurrency(allocationSplit.totalCashPayout, currency)} ({allocationSplit.cashPayoutCount})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-bold">Total Dividend:</span>
                      <span className="text-base text-primary font-black">
                        {formatCurrency(parsedDistributeAmount, currency)}
                      </span>
                    </div>
                  </CardFooter>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Historical Distribution Ledger */}
        <TabsContent value="history" className="space-y-6">
          <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/60 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <History className="h-5 w-5" /> Interest Distribution Audit Ledger
                  </CardTitle>
                  <CardDescription className="text-blue-100 text-xs mt-0.5">
                    Immutable chronological record of all dividend distribution runs executed by administrators.
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-blue-200" />
                  <Input
                    placeholder="Search ledger notes..."
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="pl-8 h-8 rounded-lg text-xs bg-white/10 text-white placeholder:text-blue-200 border-white/20 focus-visible:ring-white"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-blue-600/90 text-white">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="py-4 px-6 text-white font-bold text-xs">Execution Timestamp</TableHead>
                    <TableHead className="text-white font-bold text-xs">Audit Justification &amp; Resolution</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Profit Distributed</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Benefited Savers</TableHead>
                    <TableHead className="text-center text-white font-bold text-xs">Status</TableHead>
                    <TableHead className="text-right px-6 text-white font-bold text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLedger.length > 0 ? (
                    filteredLedger.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/30 text-xs">
                        <TableCell className="py-4 px-6 font-medium whitespace-nowrap">
                          <div className="font-bold text-foreground">{format(item.date, 'PPP')}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" /> {format(item.date, 'p')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-foreground max-w-md">{item.justification}</div>
                          {item.totalPool > 0 && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Savings pool at run: {formatCurrency(item.totalPool, currency)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-extrabold text-primary text-sm whitespace-nowrap">
                          +{formatCurrency(item.amount, currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {item.recipientsCount} active savers
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Reconciled
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          {item.breakdown && item.breakdown.length > 0 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedLedgerItem(item)}
                              className="h-7 text-[11px] font-bold rounded-lg gap-1 border-primary/30 text-primary hover:bg-primary/10"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Breakdown
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">Audited</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-44 text-center text-muted-foreground italic text-xs">
                        No previous interest distribution events recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog before Authoritative Execution */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="h-5 w-5 text-primary" />
              Confirm Profit Distribution
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please review the distribution parameters carefully. Once executed, this transaction is permanent and will credit all eligible savers according to their elected preference.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Total Profit to Credit:</span>
                <span className="text-lg font-black text-primary">
                  {formatCurrency(parsedDistributeAmount, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Eligible Recipient Savers:</span>
                <span className="font-bold text-foreground">{poolMetrics.activeSaversCount} members</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Remaining Undistributed Pool:</span>
                <span className="font-bold text-foreground">
                  {formatCurrency(poolMetrics.availableUndistributedInterest - parsedDistributeAmount, currency)}
                </span>
              </div>
            </div>

            {/* Two-Track Distribution Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold mb-1">
                  <PiggyBank className="h-3.5 w-3.5" /> Reinvest into Savings
                </div>
                <div className="text-base font-extrabold text-foreground">
                  {formatCurrency(allocationSplit.totalCapitalized, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {allocationSplit.capitalizedCount} members &bull; Excluded from cash
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-1">
                  <Banknote className="h-3.5 w-3.5" /> Cash Payout
                </div>
                <div className="text-base font-extrabold text-foreground">
                  {formatCurrency(allocationSplit.totalCashPayout, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {allocationSplit.cashPayoutCount} members &bull; Liquid interest
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Logged Justification
              </Label>
              <p className="text-xs bg-muted p-3 rounded-lg border text-foreground font-medium">
                {justificationInput}
              </p>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
              <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Verified contribution records will be created immediately for members electing contribution reinvestment. Cash dividends will be credited to accrued interest.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isAllocating}
              onClick={() => setIsConfirmModalOpen(false)}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isAllocating}
              onClick={handleConfirmDistribution}
              className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              {isAllocating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Distributing Now...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Authorize &amp; Allocate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Launch Member Payout Campaign Dialog */}
      <Dialog open={isLaunchModalOpen} onOpenChange={setIsLaunchModalOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl p-6">
          <form onSubmit={handleOpenCampaign} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Megaphone className="h-5 w-5 text-primary" />
                Initiate Member Payout Request
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Opens an interactive payout election poll banner across all member portfolios. Members can choose between adding their interest share to their verified contributions (savings) or receiving a liquid cash payout.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="target-amount" className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Target Dividend Pool ({currency}) <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Input
                  id="target-amount"
                  type="number"
                  min="0"
                  placeholder={`e.g. ${poolMetrics.availableUndistributedInterest || 0}`}
                  value={campaignTargetAmountInput}
                  onChange={(e) => setCampaignTargetAmountInput(e.target.value)}
                  className="rounded-xl font-bold bg-muted/40"
                />
                <p className="text-[10px] text-muted-foreground">
                  Gives members visibility into the expected pool size being distributed.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="announcement" className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Announcement / Instructions for Members <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Textarea
                  id="announcement"
                  placeholder="e.g. Dear members, our interest dividend distribution has been initiated. Please select your preferred payout option before Friday."
                  value={campaignAnnouncementInput}
                  onChange={(e) => setCampaignAnnouncementInput(e.target.value)}
                  rows={3}
                  className="rounded-xl text-xs bg-muted/40"
                />
              </div>

              <div className="p-3 bg-muted rounded-xl text-xs text-muted-foreground space-y-1">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" /> How it works:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Members who choose <strong>Add to Total Contribution</strong> are excluded from cash payouts, and their dividend is automatically added directly to their verified savings. Members who choose <strong>Cash Payout</strong> receive withdrawable liquid accrued interest.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isLaunchingCampaign}
                onClick={() => setIsLaunchModalOpen(false)}
                className="rounded-xl font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLaunchingCampaign}
                className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                {isLaunchingCampaign ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Launching...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" /> Launch Payout Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Historical Breakdown Detail Dialog */}
      <Dialog open={Boolean(selectedLedgerItem)} onOpenChange={(open) => !open && setSelectedLedgerItem(null)}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] flex flex-col rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-primary" />
              Distribution Run Breakdown
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Executed on {selectedLedgerItem?.date ? format(selectedLedgerItem.date, 'PPP p') : ''} &bull; Total: {formatCurrency(selectedLedgerItem?.amount || 0, currency)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="bg-muted/40 p-3 rounded-xl border text-xs space-y-1">
              <p className="font-bold text-foreground">Audit Justification:</p>
              <p className="text-muted-foreground">{selectedLedgerItem?.justification}</p>
            </div>

            {/* Split breakdown summary chips if available */}
            {(selectedLedgerItem?.totalCapitalizedToContributions > 0 || selectedLedgerItem?.totalCashPayout > 0) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold mb-0.5">
                    <PiggyBank className="h-3.5 w-3.5" /> Reinvested to Savings
                  </div>
                  <div className="text-base font-extrabold text-foreground">
                    {formatCurrency(selectedLedgerItem.totalCapitalizedToContributions, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedLedgerItem.capitalizedCount} members credited with verified savings
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-0.5">
                    <Banknote className="h-3.5 w-3.5" /> Liquid Cash Payouts
                  </div>
                  <div className="text-base font-extrabold text-foreground">
                    {formatCurrency(selectedLedgerItem.totalCashPayout, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedLedgerItem.cashPayoutCount} members credited with withdrawable interest
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader className="bg-blue-600/90 text-white">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="py-2.5 px-3 text-white font-bold text-xs">Recipient Member</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Savings at Run</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs">Share Ratio</TableHead>
                    <TableHead className="text-center text-white font-bold text-xs">Payout Channel</TableHead>
                    <TableHead className="text-right text-white font-bold text-xs text-emerald-200">Dividend Credited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLedgerItem?.breakdown && selectedLedgerItem.breakdown.length > 0 ? (
                    selectedLedgerItem.breakdown.map((b: any, idx: number) => (
                      <TableRow key={b.memberId || idx} className="text-xs hover:bg-muted/30">
                        <TableCell className="py-2.5 px-3 font-semibold">
                          {b.memberName || b.name || b.memberEmail || b.memberId}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(b.contributions || b.savings || 0, currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-primary font-bold">
                          {b.shareRatio ? `${(b.shareRatio * 100).toFixed(2)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {b.payoutType === 'add_to_contribution' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none font-bold text-[10px] gap-1 py-0.5">
                              <PiggyBank className="h-3 w-3" /> To Savings
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-none font-bold text-[10px] gap-1 py-0.5">
                              <Banknote className="h-3 w-3" /> Cash Payout
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(b.distributedShare || b.share || 0, currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-28 text-center text-muted-foreground text-xs italic">
                        Detailed member breakdown not stored for this legacy audit record.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedLedgerItem(null)}
              className="rounded-xl font-bold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
