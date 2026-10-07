'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search,
  Loader2,
  Wallet,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  TrendingUp,
  Eye,
  Zap,
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  X,
  ExternalLink,
  Receipt,
  User,
  Calendar,
  AlertTriangle,
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
  reviewContributionAction,
  verifyContributionAction,
  rejectContributionAction,
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pending Initial Review', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/30' },
  pending_review:   { label: 'Pending Initial Review', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/30' },
  pending_reviewer: { label: 'Awaiting Reviewer',      color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-400/30' },
  reviewed:         { label: 'Reviewed — Ready for Approval', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-400/30' },
  pending_approval: { label: 'Awaiting Admin Approval', color: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-400/30' },
  revision_requested: { label: 'Revision Needed',      color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-400/30' },
  approved:         { label: 'Approved & Committed',   color: 'bg-green-600/10 text-green-700 dark:text-green-400 border-green-500/30' },
  verified:         { label: 'Approved & Committed',   color: 'bg-green-600/10 text-green-700 dark:text-green-400 border-green-500/30' },
  rejected:         { label: 'Rejected',                color: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-400/30' },
  reversed:         { label: 'Reversed',                color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-400/30' },
};

const PENDING_STATUSES = ['pending', 'pending_review', 'pending_reviewer', 'reviewed', 'pending_approval', 'revision_requested'];

export default function AdminContributionsPage() {
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

  const isAuthorized = Boolean(
    user && ['admin', 'management', 'accountant', 'senior_accountant', 'reviewer', 'auditor'].includes(userRole)
  );

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'batches'>('all');
  const [search, setSearch] = useState('');
  const [inspectSlip, setInspectSlip] = useState<any | null>(null);
  const [inspectBatch, setInspectBatch] = useState<any | null>(null);

  // Quick Action Modal State (Review for Reviewer/Senior Accountant, Approval for Super Admin)
  const [actionSlip, setActionSlip] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'review'>('approve');
  const [actionJustification, setActionJustification] = useState('');
  const [isPerformingAction, setIsPerformingAction] = useState(false);

  // Stepper index for Quick Card
  const [quickCardIndex, setQuickCardIndex] = useState(0);

  // Fetch all registered members for name & profile resolution
  const membersQuery = useMemoFirebase(
    () => isAuthorized ? query(collection(firestore, 'users')) : null,
    [firestore, isAuthorized]
  );
  const { data: membersSnap } = useCollection(membersQuery);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const memberMap = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);

  const getMemberData = (id: string) => (memberMap.get(id) as any) || null;
  const getMemberName = (id: string) => (memberMap.get(id) as any)?.name || id || 'Unknown Member';

  // Fetch all individual contributions
  const slipsQuery = useMemoFirebase(
    () => isAuthorized ? query(collection(firestore, 'contributions')) : null,
    [firestore, isAuthorized]
  );
  const { data: slipsSnap, loading: loadingSlips } = useCollection(slipsQuery);

  // Fetch all contribution batches
  const batchesQuery = useMemoFirebase(
    () => isAuthorized ? query(collection(firestore, 'contribution_batches')) : null,
    [firestore, isAuthorized]
  );
  const { data: batchesSnap, loading: loadingBatches } = useCollection(batchesQuery);

  // Parse and sort all slips in memory by date descending
  const allSlips = useMemo(() => {
    const raw = (slipsSnap?.docs || []).map(d => ({ id: d.id, ...d.data() as any, _type: 'slip' }));
    return raw.sort((a, b) => {
      const timeA = parseDateMs(a.createdAt || a.date || a.timestamp);
      const timeB = parseDateMs(b.createdAt || b.date || b.timestamp);
      return timeB - timeA;
    });
  }, [slipsSnap]);

  // Parse and sort all batches in memory by date descending
  const allBatches = useMemo(() => {
    const raw = (batchesSnap?.docs || []).map(d => ({ id: d.id, ...d.data() as any, _type: 'batch' }));
    return raw.sort((a, b) => {
      const timeA = parseDateMs(a.initiatedAt || a.createdAt || a.date);
      const timeB = parseDateMs(b.initiatedAt || b.createdAt || b.date);
      return timeB - timeA;
    });
  }, [batchesSnap]);

  const pendingSlips = useMemo(() => allSlips.filter(s => PENDING_STATUSES.includes(s.status)), [allSlips]);
  const approvedSlips = useMemo(() => allSlips.filter(s => ['approved', 'verified'].includes(s.status)), [allSlips]);
  const pendingBatches = useMemo(() => allBatches.filter(b => PENDING_STATUSES.includes(b.status)), [allBatches]);
  const approvedBatches = useMemo(() => allBatches.filter(b => b.status === 'approved'), [allBatches]);

  // Slips ready for Admin approval (reviewed by Senior Accountant/Reviewer)
  const slipsReadyForAdminApproval = useMemo(
    () => allSlips.filter(s => s.status === 'reviewed'),
    [allSlips]
  );

  // Slips awaiting initial review (by Senior Accountant or Reviewer)
  const slipsAwaitingReview = useMemo(
    () => allSlips.filter(s => s.status === 'pending' || s.status === 'pending_reviewer' || s.status === 'pending_review'),
    [allSlips]
  );

  // Segregation of duties helper
  const isSlipInitiatedByCurrentUser = (slip: any) =>
    Boolean(user && slip && (slip.memberId === user.uid || slip.recordedBy === user.uid));

  // Determine items actionable by the current user:
  // - Admin: can only APPROVE slips that have status === 'reviewed'. Admin can NEVER review!
  // - Senior Accountant: reviews slips with status === 'pending'
  // - Reviewer: reviews slips with status === 'pending_reviewer'
  const userActionableSlips = useMemo(() => {
    if (isSuperAdmin) {
      return slipsReadyForAdminApproval;
    }
    if (isSeniorAccountant) {
      return allSlips.filter(s => s.status === 'pending');
    }
    if (isReviewer) {
      return allSlips.filter(s => s.status === 'pending_reviewer');
    }
    return [];
  }, [isSuperAdmin, isSeniorAccountant, isReviewer, slipsReadyForAdminApproval, allSlips]);

  // Active slip for the top Quick Card
  const activeQuickSlip = useMemo(() => {
    if (userActionableSlips.length > 0) {
      const safeIdx = Math.min(quickCardIndex, userActionableSlips.length - 1);
      return userActionableSlips[safeIdx >= 0 ? safeIdx : 0];
    }
    // If Admin has no slips ready for approval, but there are unreviewed slips pending:
    if (isSuperAdmin && slipsAwaitingReview.length > 0) {
      const safeIdx = Math.min(quickCardIndex, slipsAwaitingReview.length - 1);
      return slipsAwaitingReview[safeIdx >= 0 ? safeIdx : 0];
    }
    // Fallback: latest overall slip
    return allSlips[0] || null;
  }, [userActionableSlips, isSuperAdmin, slipsAwaitingReview, quickCardIndex, allSlips]);

  // KPI numbers
  const totalContributedSlips = useMemo(() => approvedSlips.reduce((s, c) => s + (Number(c.amount) || 0), 0), [approvedSlips]);
  const totalContributedBatches = useMemo(() => approvedBatches.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0), [approvedBatches]);
  const totalContributed = totalContributedSlips + totalContributedBatches;

  // Filtered slips based on active tab and search query
  const filteredSlips = useMemo(() => {
    let list = activeTab === 'pending' ? pendingSlips
      : activeTab === 'approved' ? approvedSlips
      : allSlips;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        getMemberName(s.memberId).toLowerCase().includes(q) ||
        (s.period || '').toLowerCase().includes(q) ||
        (s.status || '').toLowerCase().includes(q) ||
        String(s.amount || '').includes(q)
      );
    }
    return list;
  }, [activeTab, pendingSlips, approvedSlips, allSlips, search, memberMap]);

  // Filtered batches based on active tab and search query
  const filteredBatches = useMemo(() => {
    let list = activeTab === 'pending' ? pendingBatches
      : activeTab === 'approved' ? approvedBatches
      : allBatches;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.initiatorName || '').toLowerCase().includes(q) ||
        (b.defaultPeriod || '').toLowerCase().includes(q) ||
        (b.status || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, pendingBatches, approvedBatches, allBatches, search]);

  const isLoading = loadingSlips || loadingBatches;

  // Handler: Execute Approval (Admin) or Review (Senior Accountant/Reviewer) or Rejection
  const handleSubmitAction = async (decision: 'confirm' | 'reject') => {
    if (!actionSlip || !user) return;
    if (isBrowserOffline()) {
      toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'You are currently offline. Please reconnect to submit.',
      });
      return;
    }

    if (isSlipInitiatedByCurrentUser(actionSlip) && !isSeniorAccountant) {
      toast({
        variant: 'destructive',
        title: 'Segregation of Duties Violation',
        description: 'You cannot approve or review your own contribution submission. Another officer must sign off.',
      });
      return;
    }

    if (!actionJustification.trim()) {
      toast({
        variant: 'destructive',
        title: 'Justification Required',
        description: 'Please provide audit justification notes.',
      });
      return;
    }

    setIsPerformingAction(true);
    try {
      if (decision === 'confirm') {
        if (isSuperAdmin) {
          // ADMIN APPROVES (strictly approve/verify, never review)
          await verifyContributionAction(user.uid, {
            contributionId: actionSlip.id,
            justification: actionJustification.trim(),
          });
          toast({
            title: 'Deposit Approved',
            description: `Contribution slip of ${formatCurrency(actionSlip.amount, currency)} has been approved and committed to the official ledger.`,
          });
        } else {
          // REVIEWER / SENIOR ACCOUNTANT REVIEWS
          await reviewContributionAction({
            contributionId: actionSlip.id,
            justification: actionJustification.trim(),
          });
          toast({
            title: 'Deposit Reviewed',
            description: `Contribution slip has been reviewed and forwarded for executive ratification.`,
          });
        }
      } else {
        // REJECT
        await rejectContributionAction(user.uid, {
          contributionId: actionSlip.id,
          rejectionReason: actionJustification.trim(),
        });
        toast({
          title: 'Deposit Rejected',
          description: 'Contribution deposit submission has been rejected.',
        });
      }
      setActionSlip(null);
      setActionJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: 'destructive',
        title: parsed.title || 'Operation Failed',
        description: parsed.message,
      });
    } finally {
      setIsPerformingAction(false);
    }
  };

  const openApproveModal = (slip: any) => {
    setActionSlip(slip);
    setActionType('approve');
    setActionJustification('');
  };

  const openReviewModal = (slip: any) => {
    setActionSlip(slip);
    setActionType('review');
    setActionJustification('');
  };

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
            You do not have administrative or accounting permissions to access the Contributions Register.
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
              Contributions Register
            </Badge>
            {isSuperAdmin && slipsReadyForAdminApproval.length > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-400/30 text-[9px] font-bold">
                {slipsReadyForAdminApproval.length} Deposit{slipsReadyForAdminApproval.length > 1 ? 's' : ''} Ready for Your Approval
              </Badge>
            )}
            {pendingSlips.length > 0 && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/30 text-[9px] font-bold">
                {pendingSlips.length} Total Pending Item{pendingSlips.length > 1 ? 's' : ''}
              </Badge>
            )}
            {pendingBatches.length > 0 && (
              <Badge className="bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-400/30 text-[9px] font-bold">
                {pendingBatches.length} Batch{pendingBatches.length > 1 ? 'es' : ''} Pending
              </Badge>
            )}
          </div>
          <h1 className="text-[14px] sm:text-base font-bold font-headline text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Contributions & Savings Ledger
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isSuperAdmin
              ? 'Executive ledger of member savings and batch uploads. Authorize reviewed deposits and inspect audit trails.'
              : 'Audit register of individual member deposit slips and batch uploads with dual-control review workflow.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/approvals">
            <Button className="rounded-xl h-10 px-4 font-bold text-xs gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
              <ShieldCheck className="h-4 w-4" /> Open Approvals Hub
            </Button>
          </Link>
        </div>
      </div>

      {/* QUICK APPROVAL / QUICK REVIEW CARD */}
      <Card className="border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.03] shadow-md rounded-2xl overflow-hidden">
        <CardHeader className="bg-primary/10 border-b border-primary/15 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl text-white shadow-sm",
              isSuperAdmin ? "bg-emerald-600" : "bg-primary"
            )}>
              {isSuperAdmin ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-bold text-foreground">
                  {isSuperAdmin
                    ? 'Quick Approval — Latest Contribution Deposit'
                    : 'Quick Review — Latest Contribution Deposit'}
                </CardTitle>
                {isSuperAdmin ? (
                  activeQuickSlip?.status === 'reviewed' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-400/40 text-[9px] uppercase font-bold animate-pulse">
                      Ready for Your Approval
                    </Badge>
                  ) : activeQuickSlip && (activeQuickSlip.status === 'pending' || activeQuickSlip.status === 'pending_reviewer') ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40 text-[9px] uppercase font-bold">
                      Awaiting Initial Review
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-400/40 text-[9px] uppercase font-bold">
                      Up To Date
                    </Badge>
                  )
                ) : (
                  activeQuickSlip && PENDING_STATUSES.includes(activeQuickSlip.status) ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40 text-[9px] uppercase font-bold animate-pulse">
                      Action Required
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-400/40 text-[9px] uppercase font-bold">
                      Up To Date
                    </Badge>
                  )
                )}
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                {isSuperAdmin ? (
                  userActionableSlips.length > 0
                    ? `Showing reviewed deposits awaiting executive ratification (${quickCardIndex + 1} of ${userActionableSlips.length})`
                    : slipsAwaitingReview.length > 0
                    ? `No deposits currently awaiting your approval. ${slipsAwaitingReview.length} deposit(s) must first be reviewed by a Senior Accountant / Reviewer.`
                    : 'All incoming deposits have been ratified and committed into the official ledger.'
                ) : (
                  userActionableSlips.length > 0
                    ? `Showing pending deposits awaiting dual-control verification (${quickCardIndex + 1} of ${userActionableSlips.length})`
                    : 'All incoming deposits assigned to your review queue are completed.'
                )}
              </CardDescription>
            </div>
          </div>

          {/* Stepper controls if multiple actionable deposits exist */}
          {userActionableSlips.length > 1 && (
            <div className="flex items-center gap-1.5 self-start sm:self-center bg-background/80 border border-border rounded-xl p-1 shadow-xs">
              <Button
                variant="ghost"
                size="icon"
                disabled={quickCardIndex === 0}
                onClick={() => setQuickCardIndex(prev => Math.max(0, prev - 1))}
                className="h-7 w-7 rounded-lg"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] font-bold px-2 text-muted-foreground">
                {quickCardIndex + 1} / {userActionableSlips.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={quickCardIndex >= userActionableSlips.length - 1}
                onClick={() => setQuickCardIndex(prev => Math.min(userActionableSlips.length - 1, prev + 1))}
                className="h-7 w-7 rounded-lg"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Loading contribution deposit details…</p>
            </div>
          ) : !activeQuickSlip ? (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              No contribution deposits found in the system.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Member Profile & Slip Info */}
              <div className="lg:col-span-5 flex items-start gap-4">
                {(() => {
                  const member = getMemberData(activeQuickSlip.memberId);
                  const memberName = member?.name || activeQuickSlip.memberId || 'Unknown Member';
                  const initials = memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const isSelf = isSlipInitiatedByCurrentUser(activeQuickSlip);
                  return (
                    <>
                      <Avatar className="h-12 w-12 border-2 border-primary/20 shadow-sm shrink-0">
                        {member?.avatarUrl && <AvatarImage src={member.avatarUrl} alt={memberName} />}
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-foreground truncate">{memberName}</p>
                          <StatusBadge status={activeQuickSlip.status} />
                          {isSelf && (
                            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                              Initiated by you
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {member?.email || member?.phone || `ID: ${activeQuickSlip.memberId?.slice(0, 10)}`}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                          <Calendar className="h-3 w-3 text-primary shrink-0" />
                          <span>Submitted: {formatDate(activeQuickSlip.createdAt || activeQuickSlip.date)}</span>
                        </div>
                        {activeQuickSlip.proofUrl && (
                          <a
                            href={activeQuickSlip.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline pt-0.5"
                          >
                            <ExternalLink className="h-3 w-3" /> View Deposit Receipt Slip
                          </a>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Amount & Period */}
              <div className="lg:col-span-3 border-y lg:border-y-0 lg:border-x border-border/60 py-3 lg:py-0 lg:px-6 space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                  Deposit Amount
                </span>
                <p className="text-xl sm:text-2xl font-extrabold text-primary tracking-tight">
                  {formatCurrency(Number(activeQuickSlip.amount) || 0, currency)}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Period:</span>
                  <span>{activeQuickSlip.period || 'General Contribution'}</span>
                </div>
                {activeQuickSlip.reviewedByName && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold truncate pt-0.5">
                    ✓ Reviewed by {activeQuickSlip.reviewedByName}
                  </p>
                )}
                {activeQuickSlip.notes && (
                  <p className="text-[11px] text-muted-foreground italic truncate">
                    &ldquo;{activeQuickSlip.notes}&rdquo;
                  </p>
                )}
              </div>

              {/* Action Buttons Column */}
              <div className="lg:col-span-4 flex flex-col gap-2 justify-center">
                {/* 1. SUPER ADMIN: Can only APPROVE reviewed slips. CAN NEVER REVIEW. */}
                {isSuperAdmin ? (
                  activeQuickSlip.status === 'reviewed' ? (
                    <>
                      <Button
                        onClick={() => openApproveModal(activeQuickSlip)}
                        disabled={isSlipInitiatedByCurrentUser(activeQuickSlip)}
                        className="rounded-xl font-bold text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5 w-full"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Deposit
                      </Button>
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInspectSlip(activeQuickSlip)}
                          className="rounded-xl text-xs font-bold gap-1 flex-1 h-8"
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Button>
                        <Link href="/admin/approvals" className="flex-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-xl text-xs font-bold gap-1 w-full h-8"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" /> Approvals Hub
                          </Button>
                        </Link>
                      </div>
                    </>
                  ) : activeQuickSlip.status === 'pending' || activeQuickSlip.status === 'pending_reviewer' ? (
                    <div className="space-y-2 w-full">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          Dual-Control Segregation
                        </p>
                        <p className="text-[11px] mt-0.5">
                          Requires initial review by Senior Accountant / Reviewer before you can approve.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInspectSlip(activeQuickSlip)}
                          className="rounded-xl text-xs font-bold gap-1 flex-1 h-8"
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Button>
                        <Link href="/admin/approvals" className="flex-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-xl text-xs font-bold gap-1 w-full h-8"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" /> Approvals Hub
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 w-full">
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-0.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Ledger Record</p>
                        <p className="text-foreground font-semibold">
                          {activeQuickSlip.approvedByName || activeQuickSlip.verifiedByName || 'Official Ledger Committed'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInspectSlip(activeQuickSlip)}
                        className="w-full rounded-xl text-xs font-bold gap-1 h-8"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Audit Trail
                      </Button>
                    </div>
                  )
                ) : (
                  /* 2. SENIOR ACCOUNTANT / REVIEWER: Reviews initial pending slips. */
                  (isSeniorAccountant && activeQuickSlip.status === 'pending') ||
                  (isReviewer && !isSuperAdmin && activeQuickSlip.status === 'pending_reviewer') ? (
                    <>
                      <Button
                        onClick={() => openReviewModal(activeQuickSlip)}
                        disabled={isSlipInitiatedByCurrentUser(activeQuickSlip) && !isSeniorAccountant}
                        className="rounded-xl font-bold text-xs h-9 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 gap-1.5 w-full"
                      >
                        <Eye className="h-3.5 w-3.5" /> Review Deposit
                      </Button>
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInspectSlip(activeQuickSlip)}
                          className="rounded-xl text-xs font-bold gap-1 flex-1 h-8"
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Button>
                        <Link href="/admin/approvals" className="flex-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-xl text-xs font-bold gap-1 w-full h-8"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" /> Approvals Hub
                          </Button>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 w-full">
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-0.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Status</p>
                        <p className="text-foreground font-semibold">
                          {STATUS_CONFIG[activeQuickSlip.status]?.label || activeQuickSlip.status}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInspectSlip(activeQuickSlip)}
                        className="w-full rounded-xl text-xs font-bold gap-1 h-8"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Audit Trail
                      </Button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Verified Savings', value: formatCurrency(totalContributed, currency), icon: TrendingUp, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10' },
          {
            label: isSuperAdmin ? 'Ready For Approval' : 'Pending Review',
            value: isSuperAdmin ? String(slipsReadyForAdminApproval.length) : String(pendingSlips.length + pendingBatches.length),
            icon: Clock,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-500/10'
          },
          { label: 'Approved Slips', value: String(approvedSlips.length), icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Approved Batches', value: String(approvedBatches.length), icon: Layers, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
        ].map(k => (
          <Card key={k.label} className="border border-border rounded-2xl shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl shrink-0', k.bg)}>
                <k.icon className={cn('h-5 w-5', k.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider truncate">{k.label}</p>
                <p className="text-base sm:text-lg font-bold text-foreground truncate mt-0.5">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FILTER SEARCH & TABS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full sm:w-auto">
            <TabsList className="grid grid-cols-4 w-full sm:w-auto h-10 p-1 bg-muted/60 rounded-xl">
              <TabsTrigger value="all" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
                <Filter className="h-3 w-3" /> All
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
                <Clock className="h-3 w-3" /> Pending {pendingSlips.length + pendingBatches.length > 0 && `(${pendingSlips.length + pendingBatches.length})`}
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
                <CheckCircle2 className="h-3 w-3" /> Approved
              </TabsTrigger>
              <TabsTrigger value="batches" className="text-[11px] uppercase tracking-wider px-3.5 gap-1.5 rounded-lg font-bold">
                <Layers className="h-3 w-3" /> Batches
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search member, period, amount…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl text-xs bg-card"
            />
          </div>
        </div>

        {/* TAB CONTENTS */}
        <div className="space-y-6">
          {activeTab === 'batches' ? (
            <BatchesTable
              batches={filteredBatches}
              loading={isLoading}
              currency={currency}
              onInspect={setInspectBatch}
            />
          ) : activeTab === 'pending' ? (
            <div className="space-y-6">
              <SlipsTable
                slips={filteredSlips}
                loading={isLoading}
                currency={currency}
                getMemberName={getMemberName}
                isSuperAdmin={isSuperAdmin}
                isSeniorAccountant={isSeniorAccountant}
                isReviewer={isReviewer}
                isSlipInitiatedByCurrentUser={isSlipInitiatedByCurrentUser}
                onInspect={setInspectSlip}
                onApprove={openApproveModal}
                onReview={openReviewModal}
              />
              {filteredBatches.length > 0 && (
                <BatchesTable
                  batches={filteredBatches}
                  loading={isLoading}
                  currency={currency}
                  onInspect={setInspectBatch}
                />
              )}
            </div>
          ) : (
            <SlipsTable
              slips={filteredSlips}
              loading={isLoading}
              currency={currency}
              getMemberName={getMemberName}
              isSuperAdmin={isSuperAdmin}
              isSeniorAccountant={isSeniorAccountant}
              isReviewer={isReviewer}
              isSlipInitiatedByCurrentUser={isSlipInitiatedByCurrentUser}
              onInspect={setInspectSlip}
              onApprove={openApproveModal}
              onReview={openReviewModal}
            />
          )}
        </div>
      </div>

      {/* ACTION DIALOG: APPROVE (SUPER ADMIN) OR REVIEW (SENIOR ACCOUNTANT/REVIEWER) */}
      <Dialog open={!!actionSlip} onOpenChange={open => !open && setActionSlip(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              {isSuperAdmin ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Executive Approval — {getMemberName(actionSlip?.memberId)}
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 text-primary" />
                  Initial Review — {getMemberName(actionSlip?.memberId)}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isSuperAdmin
                ? 'Authorize this reviewed deposit and commit the verified funds into the official institutional ledger.'
                : 'Perform compliance verification and endorse this deposit slip for executive sign-off.'}
            </DialogDescription>
          </DialogHeader>

          {actionSlip && (
            <div className="space-y-4 text-xs py-2">
              {/* Segregation of duties warning if applicable */}
              {isSlipInitiatedByCurrentUser(actionSlip) && !isSeniorAccountant && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>You initiated this deposit submission. Another officer must sign off.</span>
                </div>
              )}

              <div className="p-3 bg-muted/40 rounded-xl border border-border/50 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Member</span>
                  <span className="font-bold text-foreground">{getMemberName(actionSlip.memberId)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Deposit Amount</span>
                  <span className="font-bold text-primary text-sm">{formatCurrency(actionSlip.amount || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Period</span>
                  <span className="text-foreground">{actionSlip.period || 'General'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Submitted On</span>
                  <span className="text-foreground">{formatDate(actionSlip.createdAt || actionSlip.date)}</span>
                </div>
                {actionSlip.reviewedByName && (
                  <div className="flex justify-between items-center pt-1 border-t border-border/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span>Reviewed By:</span>
                    <span>{actionSlip.reviewedByName} ({formatRoleLabel(actionSlip.reviewedByRole || 'reviewer')})</span>
                  </div>
                )}
                {actionSlip.proofUrl && (
                  <div className="pt-1 border-t border-border/40">
                    <a
                      href={actionSlip.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-primary hover:underline text-[11px]"
                    >
                      <ExternalLink className="h-3 w-3" /> View Deposit Receipt Slip
                    </a>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {isSuperAdmin ? 'Approval Justification (Required) *' : 'Review Audit Notes (Required) *'}
                </label>
                <Textarea
                  placeholder={
                    isSuperAdmin
                      ? 'e.g. Bank slip matched institutional bank statement, authorized to ledger.'
                      : 'e.g. Verified deposit reference and bank stamp, endorsed for executive sign-off.'
                  }
                  value={actionJustification}
                  onChange={e => setActionJustification(e.target.value)}
                  className="text-xs rounded-xl min-h-[70px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={isPerformingAction}
              onClick={() => setActionSlip(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPerformingAction || (isSlipInitiatedByCurrentUser(actionSlip) && !isSeniorAccountant)}
              onClick={() => handleSubmitAction('reject')}
              className="rounded-xl text-xs font-bold gap-1"
            >
              <X className="h-3.5 w-3.5" /> Reject Slip
            </Button>
            <Button
              size="sm"
              disabled={isPerformingAction || (isSlipInitiatedByCurrentUser(actionSlip) && !isSeniorAccountant)}
              onClick={() => handleSubmitAction('confirm')}
              className={cn(
                "rounded-xl text-xs font-bold gap-1 text-white shadow-sm",
                isSuperAdmin
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {isPerformingAction ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSuperAdmin ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {isSuperAdmin ? 'Approve Deposit' : 'Review & Endorse'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* INDIVIDUAL SLIP DETAIL DIALOG */}
      <Dialog open={!!inspectSlip} onOpenChange={open => !open && setInspectSlip(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Wallet className="h-4 w-4 text-primary" /> Contribution Slip — {getMemberName(inspectSlip?.memberId)}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Comprehensive audit details for this individual deposit slip.
            </DialogDescription>
          </DialogHeader>
          {inspectSlip && (
            <div className="space-y-3 text-xs">
              <DetailRow label="Member" value={getMemberName(inspectSlip.memberId)} />
              <DetailRow label="Amount" value={formatCurrency(inspectSlip.amount || 0, currency)} bold />
              <DetailRow label="Period" value={inspectSlip.period || '—'} />
              <DetailRow label="Status">
                <StatusBadge status={inspectSlip.status} />
              </DetailRow>
              <DetailRow label="Date Submitted" value={formatDate(inspectSlip.createdAt || inspectSlip.date)} />
              {inspectSlip.proofUrl && (
                <DetailRow label="Payment Slip">
                  <a
                    href={inspectSlip.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-primary hover:underline text-xs"
                  >
                    <ExternalLink className="h-3 w-3" /> View Attachment
                  </a>
                </DetailRow>
              )}
              {inspectSlip.reviewedByName && (
                <DetailRow label="Reviewed by" value={`${inspectSlip.reviewedByName} (${formatRoleLabel(inspectSlip.reviewedByRole || 'reviewer')})`} />
              )}
              {inspectSlip.approvedByName && (
                <DetailRow label="Approved by" value={`${inspectSlip.approvedByName} (${formatRoleLabel(inspectSlip.approvedByRole || 'admin')})`} />
              )}
              {inspectSlip.notes && <DetailRow label="Notes" value={inspectSlip.notes} />}
              {inspectSlip.justification && <DetailRow label="Justification" value={inspectSlip.justification} />}

              {/* Segregation of duties alert if admin is inspecting unreviewed slip */}
              {isSuperAdmin && (inspectSlip.status === 'pending' || inspectSlip.status === 'pending_reviewer') && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Dual-Control Policy: An Administrator can never review deposit submissions. This slip requires initial review by a Senior Accountant or Compliance Reviewer before executive ratification.
                  </span>
                </div>
              )}

              {/* Action buttons inside details modal */}
              {isSuperAdmin && inspectSlip.status === 'reviewed' ? (
                <div className="pt-3 border-t border-border flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      openApproveModal(inspectSlip);
                      setInspectSlip(null);
                    }}
                    className="flex-1 rounded-xl font-bold text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve Deposit
                  </Button>
                  <Link href="/admin/approvals" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs gap-1.5">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Open Approvals Hub
                    </Button>
                  </Link>
                </div>
              ) : !isSuperAdmin && ((isSeniorAccountant && inspectSlip.status === 'pending') || (isReviewer && inspectSlip.status === 'pending_reviewer')) ? (
                <div className="pt-3 border-t border-border flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      openReviewModal(inspectSlip);
                      setInspectSlip(null);
                    }}
                    className="flex-1 rounded-xl font-bold text-xs gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    <Eye className="h-3.5 w-3.5" /> Review Deposit
                  </Button>
                  <Link href="/admin/approvals" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs gap-1.5">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Open Approvals Hub
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="pt-3 border-t border-border flex items-center justify-end">
                  <Link href="/admin/approvals">
                    <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs gap-1.5">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Open in Approvals Hub
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* BATCH DETAIL DIALOG */}
      <Dialog open={!!inspectBatch} onOpenChange={open => !open && setInspectBatch(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Layers className="h-4 w-4 text-primary" /> Batch — {inspectBatch?.title || inspectBatch?.batchId?.slice(0, 12)}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Comprehensive audit details for this contribution batch.
            </DialogDescription>
          </DialogHeader>
          {inspectBatch && (
            <div className="space-y-3 text-xs">
              <DetailRow label="Initiated By" value={`${inspectBatch.initiatorName || '—'} (${formatRoleLabel(inspectBatch.initiatorRole)})`} />
              <DetailRow label="Total Amount" value={formatCurrency(inspectBatch.totalAmount || 0, currency)} bold />
              <DetailRow label="Members Count" value={`${inspectBatch.totalCount || inspectBatch.items?.length || 0} members`} />
              <DetailRow label="Period" value={inspectBatch.defaultPeriod || inspectBatch.title || '—'} />
              <DetailRow label="Status">
                <StatusBadge status={inspectBatch.status} />
              </DetailRow>
              <DetailRow label="Initiated On" value={formatDate(inspectBatch.initiatedAt || inspectBatch.createdAt)} />
              {inspectBatch.reviewedByName && <DetailRow label="Reviewed by" value={`${inspectBatch.reviewedByName} (${formatRoleLabel(inspectBatch.reviewedByRole)})`} />}
              {inspectBatch.approvedByName && <DetailRow label="Approved by" value={`${inspectBatch.approvedByName} (${formatRoleLabel(inspectBatch.approvedByRole)})`} />}
              {inspectBatch.reviewNotes && <DetailRow label="Review Notes" value={inspectBatch.reviewNotes} />}
              {inspectBatch.approvalNotes && <DetailRow label="Approval Notes" value={inspectBatch.approvalNotes} />}
              {PENDING_STATUSES.includes(inspectBatch.status) && (
                <div className="pt-3 border-t border-border">
                  <Link href="/admin/approvals">
                    <Button size="sm" className="w-full rounded-xl font-bold text-xs gap-1.5 bg-primary text-primary-foreground">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Review in Approvals Hub
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SlipsTable({
  slips,
  loading,
  currency,
  getMemberName,
  isSuperAdmin,
  isSeniorAccountant,
  isReviewer,
  isSlipInitiatedByCurrentUser,
  onInspect,
  onApprove,
  onReview,
}: {
  slips: any[];
  loading: boolean;
  currency: string;
  getMemberName: (id: string) => string;
  isSuperAdmin: boolean;
  isSeniorAccountant: boolean;
  isReviewer: boolean;
  isSlipInitiatedByCurrentUser: (s: any) => boolean;
  onInspect: (s: any) => void;
  onApprove: (s: any) => void;
  onReview: (s: any) => void;
}) {
  return (
    <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
      <CardHeader className="bg-blue-600 text-white p-4 flex flex-row items-center gap-2">
        <Wallet className="h-4 w-4" />
        <CardTitle className="text-[13px] font-bold text-white">Individual Deposit Slips</CardTitle>
        <Badge className="ml-auto bg-white/20 text-white text-[10px] font-bold border-none">{slips.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Member</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Period</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Amount</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Date</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : slips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground italic">
                    No individual deposit slips found in this view.
                  </TableCell>
                </TableRow>
              ) : (
                slips.map(slip => {
                  const isSelf = isSlipInitiatedByCurrentUser(slip);
                  return (
                    <TableRow key={slip.id} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3">
                        <div className="font-semibold text-sm text-foreground">{getMemberName(slip.memberId)}</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isSelf && (
                            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                              Initiated by you
                            </Badge>
                          )}
                          {slip.proofUrl && (
                            <a
                              href={slip.proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> Attachment
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">{slip.period || '—'}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-bold text-sm text-primary">
                        {formatCurrency(Number(slip.amount) || 0, currency)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center">
                        <StatusBadge status={slip.status} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(slip.createdAt || slip.date)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. ADMIN ACTION: ONLY "Approve" for reviewed slips. NEVER "Review" */}
                          {isSuperAdmin && slip.status === 'reviewed' && (
                            <Button
                              size="sm"
                              onClick={() => onApprove(slip)}
                              disabled={isSelf}
                              className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </Button>
                          )}

                          {/* 1b. ADMIN VIEW FOR UNREVIEWED SLIPS: Shows badge, NEVER "Review" */}
                          {isSuperAdmin && (slip.status === 'pending' || slip.status === 'pending_reviewer') && (
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-400/30 px-2 py-1 rounded-md whitespace-nowrap">
                              Awaiting Review
                            </span>
                          )}

                          {/* 2. SENIOR ACCOUNTANT / REVIEWER ACTION: "Review" */}
                          {!isSuperAdmin && ((isSeniorAccountant && slip.status === 'pending') || (isReviewer && slip.status === 'pending_reviewer')) && (
                            <Button
                              size="sm"
                              onClick={() => onReview(slip)}
                              disabled={isSelf && !isSeniorAccountant}
                              className="h-7 px-2.5 rounded-lg text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
                            >
                              <Eye className="h-3 w-3" /> Review
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onInspect(slip)}
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
  );
}

function BatchesTable({
  batches,
  loading,
  currency,
  onInspect,
}: {
  batches: any[];
  loading: boolean;
  currency: string;
  onInspect: (b: any) => void;
}) {
  return (
    <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
      <CardHeader className="bg-violet-600 text-white p-4 flex flex-row items-center gap-2">
        <Layers className="h-4 w-4" />
        <CardTitle className="text-[13px] font-bold text-white">Contribution Batches</CardTitle>
        <Badge className="ml-auto bg-white/20 text-white text-[10px] font-bold border-none">{batches.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Batch Title</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Initiated By</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Total</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Members</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase">Date</TableHead>
                <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground italic">
                    No contribution batches found in this view.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map(batch => (
                  <TableRow key={batch.id} className="hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <div className="font-bold text-sm text-foreground">{batch.title || `Batch #${(batch.batchId || batch.id).slice(0, 10)}`}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{batch.defaultPeriod || '—'}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs">
                      <div className="font-semibold text-foreground">{batch.initiatorName || '—'}</div>
                      <Badge variant="secondary" className="text-[8px] uppercase font-bold mt-0.5">{formatRoleLabel(batch.initiatorRole)}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-bold text-sm text-primary">
                      {formatCurrency(Number(batch.totalAmount) || 0, currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center text-xs font-semibold">{batch.totalCount || batch.items?.length || 0}</TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <StatusBadge status={batch.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(batch.initiatedAt || batch.createdAt)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onInspect(batch)}
                        className="h-7 px-2 rounded-lg text-xs font-bold gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
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
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status || 'Unknown', color: 'bg-muted text-muted-foreground border-border' };
  return (
    <Badge className={cn('text-[9px] uppercase font-bold border', cfg.color)}>
      {cfg.label}
    </Badge>
  );
}

function DetailRow({ label, value, bold, children }: { label: string; value?: string; bold?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground font-semibold shrink-0">{label}</span>
      {children ? children : <span className={cn('text-right text-foreground', bold && 'font-bold text-primary')}>{value}</span>}
    </div>
  );
}

function formatRoleLabel(roleSlug: string | undefined): string {
  if (!roleSlug) return 'Staff';
  const map: Record<string, string> = {
    admin: 'Administrator',
    management: 'Management',
    senior_accountant: 'Senior Accountant',
    accountant: 'Accountant',
    reviewer: 'Reviewer',
    auditor: 'Auditor',
    member: 'Member',
  };
  return map[roleSlug] || roleSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
