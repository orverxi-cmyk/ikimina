'use client';

import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  Clock, 
  Send, 
  Eye, 
  Layers, 
  AlertTriangle, 
  Search, 
  Receipt, 
  CheckSquare, 
  HandCoins, 
  Wallet, 
  FileText, 
  ExternalLink, 
  Sparkles, 
  Lock, 
  Ban, 
  RotateCcw,
  Check,
  X,
  TrendingUp,
  Scale,
  Coins,
  History,
  PiggyBank,
  Banknote,
  Users,
  ShieldAlert,
  UserX,
  UserMinus,
  Trash2
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, limit, where, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  downloadStaffContributionTemplate, 
  parseStaffContributionExcel, 
  ParsedContributionRow, 
  ParseResult, 
  RegisteredMember 
} from '@/lib/excel-template';
import { 
  initiateContributionBatchAction, 
  reviewContributionBatchAction, 
  approveContributionBatchAction,
  bulkReviewContributionBatchesAction,
  bulkApproveContributionBatchesAction,
  verifyContributionAction, reviewContributionAction, reviewLoanAction,
  rejectContributionAction,
  bulkVerifyContributionsAction,
  bulkRejectContributionsAction,
  approveLoanAction,
  rejectLoanAction,
  approveExpenseAction,
  rejectExpenseAction,
  approveInterestDistributionAction,
  rejectInterestDistributionAction,
  approveAccountDeletionAction,
  rejectAccountDeletionAction,
  deleteMemberAction
} from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import { safeFormatDate } from '@/lib/loan-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from 'next/link';

export default function ApprovalsHubPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole = userData?.role || 'member';
  const isAuthorized = Boolean(user && !userDataLoading && ['admin', 'management', 'accountant', 'reviewer', 'auditor'].includes(userRole));
  const isSuperAdmin = userRole === 'admin';
  const isReviewer = userRole === 'reviewer';
  const isAccountant = userRole === 'accountant' || userRole === 'admin';

  const [mainTab, setMainTab] = useState<'batches' | 'deposits' | 'loans' | 'expenses' | 'interest' | 'deletions' | 'upload'>('batches');
  const [batchSubTab, setBatchSubTab] = useState<'pending' | 'all'>('pending');
  const [interestSubTab, setInterestSubTab] = useState<'pending' | 'all'>('pending');
  const [deletionSubTab, setDeletionSubTab] = useState<'pending' | 'all'>('pending');

  // New Batch Upload States (Accountant / Admin)
  const [batchTitle, setBatchTitle] = useState<string>('Staff Contributions Population');
  const [batchType, setBatchType] = useState<'historical_migration' | 'payroll_deduction'>('historical_migration');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(format(new Date(), 'MMMM yyyy'));
  const [justification, setJustification] = useState<string>(`Staff contributions upload for ${format(new Date(), 'MMMM yyyy')}`);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeRows, setActiveRows] = useState<ParsedContributionRow[]>([]);

  // Batch Details Modal
  const [inspectBatch, setInspectBatch] = useState<any | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [inspectSearchTerm, setInspectSearchTerm] = useState('');

  // Bulk Batch Actions
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [isBulkBatchModalOpen, setIsBulkBatchModalOpen] = useState(false);
  const [bulkBatchDecision, setBulkBatchDecision] = useState<'endorse' | 'approve' | 'reject'>('approve');
  const [bulkBatchNotes, setBulkBatchNotes] = useState('');

  // Individual Deposit Slip Details Modal
  const [inspectSlip, setInspectSlip] = useState<any | null>(null);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [slipJustification, setSlipJustification] = useState('');

  // Loan Application Details Modal
  const [inspectLoan, setInspectLoan] = useState<any | null>(null);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanJustification, setLoanJustification] = useState('');

  // Operating Expense Details Modal
  const [inspectExpense, setInspectExpense] = useState<any | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseNotes, setExpenseNotes] = useState('');

  // Interest Distribution Proposal Details Modal
  const [inspectInterest, setInspectInterest] = useState<any | null>(null);
  const [isInterestModalOpen, setIsInterestModalOpen] = useState(false);
  const [interestApprovalNotes, setInterestApprovalNotes] = useState('');
  const [interestMemberFilter, setInterestMemberFilter] = useState('');

  // Member Account Deletion Modal
  const [inspectDeletion, setInspectDeletion] = useState<any | null>(null);
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [deletionAdminNotes, setDeletionAdminNotes] = useState('');
  const [deletionRejectionReason, setDeletionRejectionReason] = useState('');

  // Super Admin Direct Deletion Modal States
  const [isDirectDeleteModalOpen, setIsDirectDeleteModalOpen] = useState(false);
  const [selectedDirectDeleteMemberId, setSelectedDirectDeleteMemberId] = useState('');
  const [directDeleteJustification, setDirectDeleteJustification] = useState('');

  // Firestore Data Subscriptions - strictly mounted only when authorized
  const membersQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'users'), orderBy('name', 'asc')) : null, [firestore, isAuthorized]);
  const { data: membersSnap } = useCollection(membersQuery);

  const batchesQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'contribution_batches'), orderBy('initiatedAt', 'desc'), limit(100)) : null, [firestore, isAuthorized]);
  const { data: batchesSnap, loading: loadingBatches } = useCollection(batchesQuery);

  const pendingSlipsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'contributions'), where('status', '==', 'pending'), limit(100)) : null, [firestore, isAuthorized]);
  const { data: pendingSlipsSnap, loading: loadingSlips } = useCollection(pendingSlipsQuery);

  const pendingLoansQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'loans'), where('status', '==', 'requested'), limit(50)) : null, [firestore, isAuthorized]);
  const { data: pendingLoansSnap, loading: loadingLoans } = useCollection(pendingLoansQuery);

  const pendingExpensesQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'expenses'), where('status', '==', 'pending'), limit(50)) : null, [firestore, isAuthorized]);
  const { data: pendingExpensesSnap, loading: loadingExpenses } = useCollection(pendingExpensesQuery);

  const interestRequestsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'interest_distribution_requests'), orderBy('createdAt', 'desc'), limit(50)) : null, [firestore, isAuthorized]);
  const { data: interestRequestsSnap, loading: loadingInterestRequests } = useCollection(interestRequestsQuery);

  const deletionRequestsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'account_deletion_requests'), orderBy('requestedAt', 'desc'), limit(50)) : null, [firestore, isAuthorized]);
  const { data: deletionRequestsSnap, loading: loadingDeletionRequests } = useCollection(deletionRequestsQuery);

  // Queries for Financial Metric Cards
  const allLoansQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'loans')) : null, [firestore, isAuthorized]);
  const { data: allLoansSnap } = useCollection(allLoansQuery);

  const allContributionsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'contributions')) : null, [firestore, isAuthorized]);
  const { data: allContributionsSnap } = useCollection(allContributionsQuery);

  const allAuditLogsQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')) : null, [firestore, isAuthorized]);
  const { data: allAuditLogsSnap } = useCollection(allAuditLogsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const memberMap = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);

  const registeredMembers: RegisteredMember[] = useMemo(() => {
    return members.map((m: any) => ({
      id: m.id,
      name: m.name || 'Unknown',
      email: m.email || '',
      phone: m.phone || '',
      role: m.role || 'member',
      avatarUrl: m.avatarUrl || ''
    }));
  }, [members]);

  const allBatches = useMemo(() => batchesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [batchesSnap]);
  const pendingBatches = useMemo(() => allBatches.filter((b: any) => b.status === 'pending_review' || b.status === 'pending_approval' || b.status === 'revision_requested'), [allBatches]);
  const pendingSlips = useMemo(() => pendingSlipsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [pendingSlipsSnap]);
  const pendingLoans = useMemo(() => pendingLoansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [pendingLoansSnap]);
  const pendingExpenses = useMemo(() => pendingExpensesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [pendingExpensesSnap]);

  const allInterestRequests = useMemo(() => interestRequestsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [interestRequestsSnap]);
  const pendingInterestRequests = useMemo(() => allInterestRequests.filter((r: any) => r.status === 'pending'), [allInterestRequests]);

  const allDeletionRequests = useMemo(() => deletionRequestsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [deletionRequestsSnap]);
  const pendingDeletionRequests = useMemo(() => allDeletionRequests.filter((r: any) => r.status === 'pending'), [allDeletionRequests]);

  const totalPendingItems = pendingBatches.length + pendingSlips.length + pendingLoans.length + pendingExpenses.length + pendingInterestRequests.length + pendingDeletionRequests.length;

  // -------------------------------------------------------------
  // FINANCIAL KPI METRICS (SCREENSHOT 1)
  // -------------------------------------------------------------
  const poolMetrics = useMemo(() => {
    const rawLoans = allLoansSnap?.docs.map(d => d.data()) || [];
    const rawContributions = allContributionsSnap?.docs.map(d => d.data()) || [];
    const rawLogs = allAuditLogsSnap?.docs.map(d => d.data()) || [];

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
      if (c.status === 'verified') {
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
      activeSaversCount: saverSet.size
    };
  }, [allLoansSnap, allContributionsSnap, allAuditLogsSnap]);

  const getMemberName = (id: string) => {
    if (!id) return 'Unknown Member';
    if (id === user?.uid) return userData?.name || 'Me';
    return (memberMap.get(id) as any)?.name || 'Unknown Member';
  };

  // -------------------------------------------------------------
  // SEGREGATION OF DUTIES HELPERS (DUAL-CONTROL RULE)
  // -------------------------------------------------------------
  const isBatchInitiatedByCurrentUser = (batch: any) => Boolean(user && batch && batch.initiatedBy === user.uid);
  const isSlipInitiatedByCurrentUser = (slip: any) => Boolean(user && slip && (slip.memberId === user.uid || slip.recordedBy === user.uid));
  const isLoanInitiatedByCurrentUser = (loan: any) => Boolean(user && loan && loan.memberId === user.uid);
  const isExpenseInitiatedByCurrentUser = (exp: any) => Boolean(user && exp && (exp.recordedBy === user.uid || exp.createdBy === user.uid));
  const isInterestInitiatedByCurrentUser = (req: any) => Boolean(user && req && req.initiatedBy === user.uid);

  // -------------------------------------------------------------
  // Excel File Parsing Handlers
  // -------------------------------------------------------------
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const result: ParseResult = await parseStaffContributionExcel(buffer, registeredMembers);
      setActiveRows(result.rows);
      const invalidCount = (result.unmatchedRows || 0) + (result.invalidAmountRows || 0);
      if (invalidCount > 0) {
        toast({
          variant: "destructive",
          title: "Validation Issues Detected",
          description: `Parsed with ${invalidCount} issue(s). Please review flagged rows before initiating.`,
        });
      } else {
        toast({
          title: "Template Parsed Successfully",
          description: `Loaded ${result.validRows} valid records totaling ${formatCurrency(result.totalAmount, currency)}.`,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Excel Parsing Failed",
        description: err.message || "Failed to process Excel spreadsheet.",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleInitiateBatch = async () => {
    if (!user) return;
    const validRows = activeRows.filter(r => r.status === 'valid' && r.memberId);
    if (validRows.length === 0) {
      return toast({ variant: "destructive", title: "No Valid Records", description: "Please upload an Excel spreadsheet with valid member records." });
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: batchTitle.trim(),
        type: batchType,
        defaultPeriod: selectedPeriod,
        justification: justification.trim(),
        items: validRows.map(r => ({
          memberId: r.memberId!,
          amount: r.amount,
          period: r.period || selectedPeriod,
          deductionDate: r.deductionDate,
          staffName: r.staffName,
          staffEmail: r.staffEmail,
          notes: r.notes
        }))
      };

      const res: any = await initiateContributionBatchAction(payload);
      toast({
        title: "Batch Initiated & Submitted for Approval",
        description: `Batch #${res.batchId} with ${res.totalCount} items totaling ${formatCurrency(res.totalAmount, currency)} is awaiting dual-control audit.`,
      });

      setActiveRows([]);
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMainTab('batches');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Batch Review & Approval Actions
  // -------------------------------------------------------------
  const handleReviewBatch = async (decision: 'endorse' | 'request_changes' | 'reject') => {
    if (!inspectBatch || !user) return;
    if (isBatchInitiatedByCurrentUser(inspectBatch)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You initiated this batch. Another reviewer or administrator must conduct the review."
      });
    }
    if (!reviewNotes.trim()) {
      return toast({ variant: "destructive", title: "Notes Required", description: "Please enter audit review notes." });
    }

    setIsSubmitting(true);
    try {
      await reviewContributionBatchAction({
        batchId: inspectBatch.batchId || inspectBatch.id,
        decision,
        reviewNotes: reviewNotes.trim()
      });
      toast({
        title: decision === 'endorse' ? "Batch Endorsed" : decision === 'request_changes' ? "Revision Requested" : "Batch Rejected",
        description: `Batch #${inspectBatch.batchId || inspectBatch.id} status has been updated.`,
      });
      setIsBatchModalOpen(false);
      setInspectBatch(null);
      setReviewNotes('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveBatch = async (decision: 'approve' | 'reject') => {
    if (!inspectBatch || !user) return;
    if (isBatchInitiatedByCurrentUser(inspectBatch)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You initiated this batch. A different Super Administrator must approve and commit it."
      });
    }
    if (!approvalNotes.trim()) {
      return toast({ variant: "destructive", title: "Notes Required", description: "Please enter final approval justification." });
    }

    setIsSubmitting(true);
    try {
      await approveContributionBatchAction({
        batchId: inspectBatch.batchId || inspectBatch.id,
        decision,
        approvalNotes: approvalNotes.trim()
      });
      toast({
        title: decision === 'approve' ? "Batch Approved & Committed to Ledger" : "Batch Rejected",
        description: decision === 'approve' 
          ? `All ${inspectBatch.totalCount || 0} contributions totaling ${formatCurrency(inspectBatch.totalAmount || 0, currency)} have been officially credited.`
          : `Batch #${inspectBatch.batchId || inspectBatch.id} was rejected.`,
      });
      setIsBatchModalOpen(false);
      setInspectBatch(null);
      setApprovalNotes('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Individual Deposit Slip Action
  // -------------------------------------------------------------
  const handleActionSlip = async (decision: 'review' | 'verify' | 'reject') => {
    if (!inspectSlip || !user) return;
    if (isSlipInitiatedByCurrentUser(inspectSlip)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You cannot verify your own deposit submission. Another administrator must verify it."
      });
    }
    if (!slipJustification.trim()) {
      return toast({ variant: "destructive", title: "Justification Required", description: "Please provide audit justification." });
    }

    setIsSubmitting(true);
    try {
      if (decision === 'verify') {
        await verifyContributionAction(user.uid, {
          contributionId: inspectSlip.id,
          justification: slipJustification.trim()
        });
        toast({ title: "Deposit Verified", description: `Contribution of ${formatCurrency(inspectSlip.amount, currency)} verified.` });
      } else {
        await rejectContributionAction(user.uid, {
          contributionId: inspectSlip.id,
          rejectionReason: slipJustification.trim()
        });
        toast({ title: "Deposit Rejected", description: "Submission has been rejected." });
      }
      setIsSlipModalOpen(false);
      setInspectSlip(null);
      setSlipJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Loan Application Action
  // -------------------------------------------------------------
  const handleActionLoan = async (decision: 'review' | 'approve' | 'reject') => {
    if (!inspectLoan || !user) return;
    if (isLoanInitiatedByCurrentUser(inspectLoan)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You cannot approve your own loan application. Another administrator must approve it."
      });
    }
    if (!loanJustification.trim()) {
      return toast({ variant: "destructive", title: "Justification Required", description: "Please provide audit notes." });
    }

    setIsSubmitting(true);
    try {
      if (decision === 'review') {
        await reviewLoanAction({
          loanId: inspectLoan.id,
          justification: loanJustification.trim()
        });
        toast({ title: "Loan Reviewed", description: "Loan request has been reviewed successfully." });
      } else if (decision === 'approve') {
        await approveLoanAction({
          loanId: inspectLoan.id,
          terms: { durationMonths: 12 },
          justification: loanJustification.trim()
        });
        toast({ title: "Loan Approved", description: `Loan facility of ${formatCurrency(inspectLoan.amount, currency)} approved.` });
      } else {
        await rejectLoanAction({
          loanId: inspectLoan.id,
          justification: loanJustification.trim()
        });
        toast({ title: "Loan Application Rejected", description: "Loan request has been rejected." });
      }
      setIsLoanModalOpen(false);
      setInspectLoan(null);
      setLoanJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Operating Expense Action
  // -------------------------------------------------------------
  const handleActionExpense = async (decision: 'approve' | 'reject') => {
    if (!inspectExpense || !user) return;
    if (isExpenseInitiatedByCurrentUser(inspectExpense)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You cannot approve an operational expense you initiated. Another administrator must sign off."
      });
    }

    setIsSubmitting(true);
    try {
      if (decision === 'approve') {
        await approveExpenseAction({
          expenseId: inspectExpense.id,
          adminNotes: expenseNotes.trim()
        });
        toast({ title: "Expense Approved", description: `Expense of ${formatCurrency(inspectExpense.amount, currency)} ratified.` });
      } else {
        await rejectExpenseAction({
          expenseId: inspectExpense.id,
          rejectionReason: expenseNotes.trim() || 'Rejected during audit review'
        });
        toast({ title: "Expense Rejected", description: "Expense item rejected." });
      }
      setIsExpenseModalOpen(false);
      setInspectExpense(null);
      setExpenseNotes('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Interest Distribution Proposal Approval Action
  // -------------------------------------------------------------
  const handleActionInterest = async (decision: 'approve' | 'reject') => {
    if (!inspectInterest || !user) return;
    if (isInterestInitiatedByCurrentUser(inspectInterest)) {
      return toast({
        variant: "destructive",
        title: "Segregation of Duties Violation",
        description: "You initiated this distribution proposal. Another Super Administrator must approve it."
      });
    }

    setIsSubmitting(true);
    try {
      if (decision === 'approve') {
        await approveInterestDistributionAction({
          requestId: inspectInterest.id,
          approvalNotes: interestApprovalNotes.trim() || undefined
        });
        toast({
          title: "Interest Distribution Approved & Committed",
          description: `Successfully allocated ${formatCurrency(inspectInterest.totalInterestToDistribute, currency)} to ${inspectInterest.recipientsCount || 0} active savers.`,
        });
      } else {
        await rejectInterestDistributionAction({
          requestId: inspectInterest.id,
          rejectionReason: interestApprovalNotes.trim() || 'Rejected during Super Administrator audit'
        });
        toast({
          title: "Distribution Proposal Rejected",
          description: "Interest distribution proposal has been rejected."
        });
      }
      setIsInterestModalOpen(false);
      setInspectInterest(null);
      setInterestApprovalNotes('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ variant: "destructive", title: parsed.title, description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionDeletion = async (decision: 'approve' | 'reject') => {
    if (!inspectDeletion) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are offline. Please reconnect and try again."
      });
    }

    if (!isSuperAdmin) {
      return toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Only Super Administrators can approve or reject account deletion requests."
      });
    }

    if (decision === 'reject' && !deletionRejectionReason.trim()) {
      return toast({
        variant: "destructive",
        title: "Rejection Reason Required",
        description: "Please enter an official audit reason for turning down this deletion request."
      });
    }

    setIsSubmitting(true);
    try {
      if (decision === 'approve') {
        await approveAccountDeletionAction({
          requestId: inspectDeletion.id,
          adminNotes: deletionAdminNotes.trim() || undefined,
          targetUserId: inspectDeletion.userId
        });
        toast({
          title: "Account Deletion Approved",
          description: `Account for ${inspectDeletion.userName || inspectDeletion.userEmail} has been permanently deleted.`
        });
      } else {
        await rejectAccountDeletionAction({
          requestId: inspectDeletion.id,
          rejectionReason: deletionRejectionReason.trim(),
          targetUserId: inspectDeletion.userId
        });
        toast({
          title: "Account Deletion Rejected",
          description: "Member deletion request has been turned down."
        });
      }
      setIsDeletionModalOpen(false);
      setInspectDeletion(null);
      setDeletionAdminNotes('');
      setDeletionRejectionReason('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Operation Failed",
        description: parsed.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Account Deletion Details for Super Admin
  const selectedDirectDeleteMember = useMemo(() => {
    if (!selectedDirectDeleteMemberId) return null;
    return memberMap.get(selectedDirectDeleteMemberId) || null;
  }, [selectedDirectDeleteMemberId, memberMap]);

  const selectedMemberDebt = useMemo(() => {
    if (!selectedDirectDeleteMemberId || !allLoansSnap) return 0;
    return allLoansSnap.docs
      .map(d => d.data())
      .filter((l: any) => l.memberId === selectedDirectDeleteMemberId && l.status === 'approved')
      .reduce((sum, l: any) => sum + (Number(l.balance) || 0), 0);
  }, [selectedDirectDeleteMemberId, allLoansSnap]);

  const selectedMemberTotalSavings = useMemo(() => {
    if (!selectedDirectDeleteMemberId || !allContributionsSnap) return 0;
    return allContributionsSnap.docs
      .map(d => d.data())
      .filter((c: any) => c.memberId === selectedDirectDeleteMemberId && c.status === 'approved')
      .reduce((sum, c: any) => sum + (Number(c.amount) || 0), 0);
  }, [selectedDirectDeleteMemberId, allContributionsSnap]);

  const handleDirectDeleteMember = async () => {
    if (!selectedDirectDeleteMemberId || !directDeleteJustification.trim()) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are offline. Please reconnect and try again."
      });
    }

    if (!isSuperAdmin) {
      return toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Only Super Administrators can execute direct account deletions."
      });
    }

    if (selectedMemberDebt > 0) {
      return toast({
        variant: "destructive",
        title: "Active Loan Balance",
        description: `Cannot delete member with active debt (${formatCurrency(selectedMemberDebt, currency)}). Settle all loans first.`
      });
    }

    setIsSubmitting(true);
    try {
      await deleteMemberAction(selectedDirectDeleteMemberId, directDeleteJustification.trim());
      toast({
        title: "Account Permanently Deleted",
        description: `Account for ${selectedDirectDeleteMember?.name || selectedDirectDeleteMember?.email || 'Member'} has been directly deleted by Super Admin.`
      });
      setIsDirectDeleteModalOpen(false);
      setSelectedDirectDeleteMemberId('');
      setDirectDeleteJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Deletion Failed",
        description: parsed.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered preview savers in the Interest Proposal Modal
  const modalFilteredBreakdown = useMemo(() => {
    if (!inspectInterest || !Array.isArray(inspectInterest.breakdown)) return [];
    if (!interestMemberFilter.trim()) return inspectInterest.breakdown;
    const term = interestMemberFilter.toLowerCase();
    return inspectInterest.breakdown.filter((item: any) => 
      (item.memberName && item.memberName.toLowerCase().includes(term)) ||
      (item.memberEmail && item.memberEmail.toLowerCase().includes(term))
    );
  }, [inspectInterest, interestMemberFilter]);

  if (userDataLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm font-bold text-muted-foreground">Loading Institutional Approvals Hub...</p>
        </div>
      </div>
    );
  }

  if (user && !isAuthorized) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-14 w-14 text-destructive" />
        <h2 className="text-2xl font-bold font-headline text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md text-xs sm:text-sm">
          Only administrators, designated reviewers, accountants, and management have permission to access institutional approvals.
        </p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/dashboard">Return to Member Portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 w-full min-w-0">
      {/* Header & Dual Control Security Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              Governance & Dual-Control
            </Badge>
            <Badge variant="outline" className="text-[9px] uppercase font-bold border-green-500/30 text-green-700 bg-green-500/5">
              <ShieldCheck className="h-3 w-3 mr-1" /> 4-Eyes Principle Enforced
            </Badge>
            {totalPendingItems > 0 && (
              <Badge className="bg-amber-500/10 text-amber-700 border-none text-[9px] font-bold">
                {totalPendingItems} Pending Action{totalPendingItems > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">Approvals Hub</h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            Audit, inspect, and approve pending batches, member deposits, loan requests, interest distributions, and operational expenses.
          </p>
        </div>

        {/* Action Button: Download Template / New Batch */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => downloadStaffContributionTemplate({ prefillMembers: registeredMembers, period: selectedPeriod, defaultAmount: settings.contributionInterestRate || 50000 })}
            className="rounded-xl h-10 px-3.5 font-bold text-[12px] border-border shadow-sm gap-1.5"
          >
            <Download className="h-4 w-4 text-primary" /> Template (.xlsx)
          </Button>
          <Button 
            onClick={() => setMainTab('upload')}
            className="rounded-xl h-10 px-4 font-bold text-[12px] shadow-sm bg-primary text-primary-foreground gap-1.5"
          >
            <Upload className="h-4 w-4" /> New Batch Upload
          </Button>
        </div>
      </div>

      {/* Main Approvals Tabs */}
      <Tabs value={mainTab} onValueChange={(val: any) => setMainTab(val)} className="w-full space-y-4">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-7 h-11">
            <TabsTrigger value="batches" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Batches {pendingBatches.length > 0 && `(${pendingBatches.length})`}
            </TabsTrigger>
            <TabsTrigger value="deposits" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Deposits {pendingSlips.length > 0 && `(${pendingSlips.length})`}
            </TabsTrigger>
            <TabsTrigger value="loans" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <HandCoins className="h-3.5 w-3.5" /> Loans {pendingLoans.length > 0 && `(${pendingLoans.length})`}
            </TabsTrigger>
            <TabsTrigger value="expenses" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> Expenses {pendingExpenses.length > 0 && `(${pendingExpenses.length})`}
            </TabsTrigger>
            <TabsTrigger value="interest" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Interest {pendingInterestRequests.length > 0 && `(${pendingInterestRequests.length})`}
            </TabsTrigger>
            <TabsTrigger value="deletions" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5 text-destructive/90 data-[state=active]:text-destructive">
              <UserX className="h-3.5 w-3.5" /> Deletions {pendingDeletionRequests.length > 0 && `(${pendingDeletionRequests.length})`}
            </TabsTrigger>
            <TabsTrigger value="upload" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload Excel
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. CONTRIBUTION BATCHES TAB */}
        <TabsContent value="batches" className="space-y-4">
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 sm:p-5 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                <CardTitle className="text-[13px] font-bold text-white">Staged Contribution Batches</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => setBatchSubTab(batchSubTab === 'pending' ? 'all' : 'pending')}
                  className="h-7 text-xs font-bold rounded-lg bg-white/20 text-white hover:bg-white/30 border-none"
                >
                  {batchSubTab === 'pending' ? 'Show All History' : 'Show Pending Only'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Batch Title / Ref</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Period / Type</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Initiator</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Items & Total</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingBatches ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : (batchSubTab === 'pending' ? pendingBatches : allBatches).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground italic">No contribution batches in this view.</TableCell></TableRow>
                    ) : (
                      (batchSubTab === 'pending' ? pendingBatches : allBatches).map((batch: any) => {
                        const isInitiatedByMe = isBatchInitiatedByCurrentUser(batch);
                        return (
                          <TableRow key={batch.id || batch.batchId} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3 font-bold text-sm">
                              <div>{batch.title || `Batch #${(batch.batchId || batch.id).slice(0, 10)}`}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">{batch.batchId || batch.id}</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <div className="font-semibold text-foreground">{batch.defaultPeriod || 'General'}</div>
                              <Badge variant="outline" className="text-[9px] uppercase font-bold mt-0.5">
                                {batch.type === 'payroll_deduction' ? 'Payroll' : 'Historical Migration'}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <div className="font-semibold text-foreground">{batch.initiatorName || 'Accountant'}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="secondary" className="text-[8px] uppercase font-bold">{batch.initiatorRole || 'Staff'}</Badge>
                                {isInitiatedByMe && (
                                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                                    Initiated by you
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right text-xs">
                              <div className="font-bold text-sm text-primary">{formatCurrency(batch.totalAmount || 0, currency)}</div>
                              <div className="text-[11px] text-muted-foreground">{batch.totalCount || batch.items?.length || 0} members</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              <Badge className={cn(
                                "text-[9px] uppercase font-bold border-none",
                                batch.status === 'pending_review' && "bg-blue-500/10 text-blue-700",
                                batch.status === 'pending_approval' && "bg-primary/10 text-primary",
                                batch.status === 'revision_requested' && "bg-amber-500/10 text-amber-700",
                                batch.status === 'approved' && "bg-green-600/10 text-green-700",
                                batch.status === 'rejected' && "bg-destructive/10 text-destructive"
                              )}>
                                {batch.status === 'pending_review' ? 'Pending Review' : batch.status === 'pending_approval' ? 'Pending Approval' : batch.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => { setInspectBatch(batch); setIsBatchModalOpen(true); }}
                                className="h-8 rounded-xl font-bold text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
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

        {/* 2. MEMBER DEPOSIT SUBMISSIONS TAB */}
        <TabsContent value="deposits" className="space-y-4">
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 sm:p-5">
              <CardTitle className="text-[13px] font-bold text-white flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Pending Member Deposit Submissions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Member</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Date / Period</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Amount</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Proof Slip</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingSlips ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : pendingSlips.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground italic">No pending member deposits awaiting verification.</TableCell></TableRow>
                    ) : (
                      pendingSlips.map((slip: any) => {
                        const isSelf = isSlipInitiatedByCurrentUser(slip);
                        return (
                          <TableRow key={slip.id} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3 font-bold text-sm">
                              <div>{getMemberName(slip.memberId)}</div>
                              {isSelf && (
                                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                                  Initiated by you
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium">
                              <div>{slip.date?.seconds ? format(new Date(slip.date.seconds * 1000), 'MMM d, yyyy') : 'Recent'}</div>
                              <div className="text-muted-foreground font-normal">{slip.period}</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-sm text-foreground">
                              {formatCurrency(slip.amount, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              {slip.proofUrl ? (
                                <a href={slip.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline font-bold text-xs">
                                  <FileText className="h-3.5 w-3.5" /> View Proof
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs italic">None</span>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => { setInspectSlip(slip); setIsSlipModalOpen(true); }}
                                className="h-8 rounded-xl font-bold text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
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

        {/* 3. LOAN APPLICATIONS TAB */}
        <TabsContent value="loans" className="space-y-4">
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 sm:p-5">
              <CardTitle className="text-[13px] font-bold text-white flex items-center gap-2">
                <HandCoins className="h-4 w-4" /> Pending Loan Applications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Applicant</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Date</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Purpose</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Requested Amount</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLoans ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : pendingLoans.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground italic">No pending loan applications awaiting audit.</TableCell></TableRow>
                    ) : (
                      pendingLoans.map((loan: any) => {
                        const isSelf = isLoanInitiatedByCurrentUser(loan);
                        return (
                          <TableRow key={loan.id} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3 font-bold text-sm">
                              <div>{getMemberName(loan.memberId)}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {loan.isTopUp && <Badge variant="outline" className="text-[8px] font-bold border-emerald-500/30 text-emerald-700 bg-emerald-500/5">Top-Up</Badge>}
                                {isSelf && (
                                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                                    Requested by you
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-foreground">
                              {safeFormatDate(loan.requestDate, 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                              {loan.description || 'Capital Facility'}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-sm text-primary">
                              {formatCurrency(loan.amount, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => { setInspectLoan(loan); setIsLoanModalOpen(true); }}
                                className="h-8 rounded-xl font-bold text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
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

        {/* 4. OPERATING EXPENSES TAB */}
        <TabsContent value="expenses" className="space-y-4">
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 sm:p-5">
              <CardTitle className="text-[13px] font-bold text-white flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Pending Operating Expenses Sign-Off
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Expense Title</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Category</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Recorded By</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Amount</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingExpenses ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : pendingExpenses.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground italic">No operational expenses pending approval.</TableCell></TableRow>
                    ) : (
                      pendingExpenses.map((exp: any) => {
                        const isSelf = isExpenseInitiatedByCurrentUser(exp);
                        return (
                          <TableRow key={exp.id} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3 font-bold text-sm">
                              <div>{exp.title}</div>
                              <div className="text-[11px] text-muted-foreground font-normal">{exp.description}</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <Badge variant="outline" className="text-[9px] uppercase font-bold">{exp.category || 'General'}</Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <div className="font-semibold">{exp.recordedByName || getMemberName(exp.recordedBy)}</div>
                              {isSelf && (
                                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                                  Initiated by you
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-sm text-foreground">
                              {formatCurrency(exp.amount, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => { setInspectExpense(exp); setIsExpenseModalOpen(true); }}
                                className="h-8 rounded-xl font-bold text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
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

        {/* 5. INTEREST DISTRIBUTION TAB (SCREENSHOTS 1 & 2) */}
        <TabsContent value="interest" className="space-y-6">
          {/* Subtitle intro */}
          <p className="text-xs text-muted-foreground font-medium">
            Allocate realized group loan interest pro-rata according to each member&apos;s verified savings weight. All allocations are audited and reconciled permanently in the financial ledger.
          </p>

          {/* 4 Financial KPI Cards (Screenshot 1) */}
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
                    {poolMetrics.availableUndistributedInterest > 0 ? "Ready to Share" : "Allocated"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-base sm:text-lg font-bold text-white tracking-tight">
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
                <div className="text-base sm:text-lg font-bold text-foreground">
                  {formatCurrency(poolMetrics.totalRealizedInterest, currency)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
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
                <div className="text-base sm:text-lg font-bold text-foreground">
                  {formatCurrency(poolMetrics.lifetimeDistributedInterest, currency)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Historical payouts credited to savers
                </p>
              </CardContent>
            </Card>

            {/* Card 4: VERIFIED CAPITAL BASE */}
            <Card className="border border-border/60 shadow-sm bg-card rounded-2xl overflow-hidden">
              <div className="bg-blue-600 px-4 py-2 border-b border-blue-700/60">
                <p className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-white" /> Verified Capital Base
                </p>
              </div>
              <CardContent className="p-5">
                <div className="text-base sm:text-lg font-bold text-foreground">
                  {formatCurrency(poolMetrics.totalVerifiedSavings, currency)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Across {poolMetrics.activeSaversCount} active eligible savers
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Staged Interest Distribution Proposals Table */}
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-blue-600 text-white p-4 sm:p-5 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-white" />
                <CardTitle className="text-[13px] font-bold text-white">Interest Distribution Proposals</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => setInterestSubTab(interestSubTab === 'pending' ? 'all' : 'pending')}
                  className="h-7 text-xs font-bold rounded-lg bg-white/20 text-white hover:bg-white/30 border-none"
                >
                  {interestSubTab === 'pending' ? 'Show All History' : 'Show Pending Only'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Proposal Ref / Date</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Initiator (Accountant)</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Justification</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Proposed Amount</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingInterestRequests ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : (interestSubTab === 'pending' ? pendingInterestRequests : allInterestRequests).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground italic">No interest distribution proposals in this view.</TableCell></TableRow>
                    ) : (
                      (interestSubTab === 'pending' ? pendingInterestRequests : allInterestRequests).map((req: any) => {
                        const isInitiatedByMe = isInterestInitiatedByCurrentUser(req);
                        return (
                          <TableRow key={req.id} className="hover:bg-muted/30">
                            <TableCell className="px-4 py-3 font-bold text-sm">
                              <div>Proposal #{req.id.slice(0, 10)}</div>
                              <div className="text-[11px] font-medium text-muted-foreground">
                                {safeFormatDate(req.createdAt, 'MMM d, yyyy')}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs">
                              <div className="font-semibold text-foreground">{req.initiatedByName || 'Accountant'}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="secondary" className="text-[8px] uppercase font-bold">{req.initiatedByRole || 'Accountant'}</Badge>
                                {isInitiatedByMe && (
                                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[8px] font-bold">
                                    Initiated by you
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                              {req.justification || 'Pro-rata dividend allocation'}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right text-xs">
                              <div className="font-bold text-sm text-primary">{formatCurrency(req.totalInterestToDistribute || 0, currency)}</div>
                              <div className="text-[11px] text-muted-foreground">{req.recipientsCount || req.breakdown?.length || 0} active savers</div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              <Badge className={cn(
                                "text-[9px] uppercase font-bold border-none",
                                req.status === 'pending' && "bg-amber-500/10 text-amber-700",
                                req.status === 'approved' && "bg-green-600/10 text-green-700",
                                req.status === 'rejected' && "bg-destructive/10 text-destructive"
                              )}>
                                {req.status === 'pending' ? 'Pending Approval' : req.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => { setInspectInterest(req); setIsInterestModalOpen(true); }}
                                className="h-8 rounded-xl font-bold text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
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

        {/* 6. NEW BATCH UPLOAD TAB */}
        <TabsContent value="upload" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-2xl bg-card">
            <CardHeader className="border-b p-4 sm:p-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Upload className="h-5 w-5 text-primary" /> Initiate New Contribution Batch
              </CardTitle>
              <CardDescription>
                Upload an Excel sheet (.xlsx) of staff source-deducted contributions. Once initiated, the batch will be submitted for dual-control review &amp; approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">Batch Title</Label>
                  <Input value={batchTitle} onChange={e => setBatchTitle(e.target.value)} placeholder="e.g. October 2026 Staff Payroll Deduction" className="h-10 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">Default Period</Label>
                  <Input value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} placeholder="e.g. October 2026" className="h-10 rounded-xl" />
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center bg-muted/20 hover:bg-muted/40 transition-colors">
                <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="batch-excel-upload" />
                <label htmlFor="batch-excel-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                  <FileSpreadsheet className="h-10 w-10 text-primary" />
                  <span className="font-bold text-sm text-foreground">Select or Drag Excel Spreadsheet</span>
                  <span className="text-xs text-muted-foreground">Supported format: .xlsx with Member ID, Amount, Period</span>
                </label>
              </div>

              {/* Parsed Preview Table */}
              {activeRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">Parsed Preview ({activeRows.filter(r => r.status === 'valid').length} valid, {activeRows.filter(r => r.status !== 'valid').length} issues)</span>
                    <span className="font-bold text-primary text-sm">Total: {formatCurrency(activeRows.filter(r => r.status === 'valid').reduce((sum, r) => sum + r.amount, 0), currency)}</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-bold">Staff / Member</TableHead>
                          <TableHead className="text-xs font-bold">Period</TableHead>
                          <TableHead className="text-xs font-bold text-right">Amount</TableHead>
                          <TableHead className="text-xs font-bold text-center">Validation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-semibold">{row.staffName || row.memberId}</TableCell>
                            <TableCell className="text-xs">{row.period}</TableCell>
                            <TableCell className="text-xs text-right font-bold">{formatCurrency(row.amount, currency)}</TableCell>
                            <TableCell className="text-xs text-center">
                              <Badge variant={row.status === 'valid' ? 'default' : 'destructive'} className="text-[8px] font-bold">
                                {row.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button 
                    onClick={handleInitiateBatch} 
                    disabled={isSubmitting || activeRows.filter(r => r.status === 'valid').length === 0} 
                    className="w-full h-12 rounded-xl font-bold text-sm bg-primary text-primary-foreground gap-2"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Initiate Batch for Dual-Control Approval
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. ACCOUNT DELETIONS TAB (SUPER ADMIN REQUEST TABLE) */}
        <TabsContent value="deletions" className="space-y-4">
          <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
            <CardHeader className="bg-red-600 text-white p-4 sm:p-5 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <UserX className="h-5 w-5" />
                <div>
                  <CardTitle className="text-[13px] font-bold text-white">Member Account Deletion Requests</CardTitle>
                  <CardDescription className="text-red-100 text-xs mt-0.5">
                    Requests submitted by scheme members to withdraw and delete their accounts. Requires Super Admin approval.
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => setDeletionSubTab(deletionSubTab === 'pending' ? 'all' : 'pending')}
                  className="h-7 text-xs font-bold rounded-lg bg-white/20 text-white hover:bg-white/30 border-none"
                >
                  {deletionSubTab === 'pending' ? 'Show All History' : 'Show Pending Only'}
                </Button>
                {isSuperAdmin && (
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={() => {
                      setSelectedDirectDeleteMemberId('');
                      setDirectDeleteJustification('');
                      setIsDirectDeleteModalOpen(true);
                    }}
                    className="h-7 text-xs font-bold rounded-lg bg-white text-red-600 hover:bg-red-50 border-none shadow-sm gap-1.5"
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Direct Deletion
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Member</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Reason for Deletion</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Verified Savings</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Accrued Interest</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Active Loan Debt</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase">Requested Date</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">Status</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDeletionRequests ? (
                      <TableRow><TableCell colSpan={8} className="h-32 text-center text-xs text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading deletion requests...</TableCell></TableRow>
                    ) : (deletionSubTab === 'pending' ? pendingDeletionRequests : allDeletionRequests).length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="h-32 text-center text-xs text-muted-foreground italic">No {deletionSubTab === 'pending' ? 'pending' : ''} account deletion requests found.</TableCell></TableRow>
                    ) : (
                      (deletionSubTab === 'pending' ? pendingDeletionRequests : allDeletionRequests).map((req: any) => {
                        const isPending = req.status === 'pending';
                        return (
                          <TableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="px-4 py-3">
                              <div className="font-bold text-xs text-foreground">{req.userName || 'Member'}</div>
                              <div className="text-[10px] text-muted-foreground">{req.userEmail}</div>
                              {req.userPhone && <div className="text-[10px] text-muted-foreground">{req.userPhone}</div>}
                            </TableCell>
                            <TableCell className="px-4 py-3 max-w-[200px]">
                              <p className="text-xs text-foreground line-clamp-2 italic">&ldquo;{req.reason}&rdquo;</p>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-xs text-foreground">
                              {formatCurrency(req.savingsBalance || 0, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right font-bold text-xs text-emerald-600">
                              +{formatCurrency(req.accruedInterest || 0, currency)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              {Number(req.activeLoanBalance || 0) > 0 ? (
                                <Badge variant="destructive" className="text-[9px] font-bold">
                                  {formatCurrency(req.activeLoanBalance, currency)} Owed
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] font-bold text-emerald-600 border-emerald-300 bg-emerald-50">
                                  Cleared (0 {currency})
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {safeFormatDate(req.requestedAt, 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center">
                              <Badge className={cn(
                                "text-[9px] font-bold uppercase",
                                req.status === 'pending' && "bg-amber-500/10 text-amber-700 border-amber-300",
                                req.status === 'approved' && "bg-green-500/10 text-green-700 border-green-300",
                                req.status === 'rejected' && "bg-destructive/10 text-destructive border-destructive/30",
                                req.status === 'cancelled' && "bg-muted text-muted-foreground"
                              )}>
                                {req.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                variant={isPending ? "destructive" : "outline"}
                                onClick={() => {
                                  setInspectDeletion(req);
                                  setDeletionAdminNotes(req.adminNotes || '');
                                  setDeletionRejectionReason(req.rejectionReason || '');
                                  setIsDeletionModalOpen(true);
                                }}
                                className="h-7 text-xs font-bold rounded-lg gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                {isPending ? 'Review Request' : 'View Details'}
                              </Button>
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
      </Tabs>

      {/* ------------------------------------------------------------- */}
      {/* 1. BATCH DETAILS MODAL (WITH DUAL-CONTROL RESTRICTION) */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
          <DialogHeader className="p-5 bg-blue-600 text-white border-b border-blue-700/30 shrink-0">
            <DialogTitle className="text-base font-bold text-white flex items-center justify-between">
              <span>{inspectBatch?.title || 'Batch Details'}</span>
              <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase">
                {inspectBatch?.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-xs mt-1">
              Ref #{inspectBatch?.batchId || inspectBatch?.id} | Initiated by <strong>{inspectBatch?.initiatorName || 'Accountant'}</strong> on {safeFormatDate(inspectBatch?.initiatedAt, 'PPP')}
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* SEGREGATION OF DUTIES ALERT */}
            {isBatchInitiatedByCurrentUser(inspectBatch) && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Dual-Control Governance Restriction</p>
                  <p className="leading-relaxed">
                    You initiated this batch (<strong>{inspectBatch?.initiatorName}</strong>). Under the cooperative four-eyes principle, a different administrator or reviewer must audit and approve this batch. Self-approval is prohibited.
                  </p>
                </div>
              </div>
            )}

            {/* Batch Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Amount</p>
                <p className="text-base font-bold text-primary mt-0.5">{formatCurrency(inspectBatch?.totalAmount || 0, currency)}</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Item Count</p>
                <p className="text-base font-bold text-foreground mt-0.5">{inspectBatch?.totalCount || inspectBatch?.items?.length || 0} Records</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Batch Type</p>
                <p className="text-xs font-bold text-foreground mt-1 uppercase">{inspectBatch?.type === 'payroll_deduction' ? 'Payroll' : 'Historical'}</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Default Period</p>
                <p className="text-xs font-bold text-foreground mt-1">{inspectBatch?.defaultPeriod || '-'}</p>
              </div>
            </div>

            {/* Items Breakdown Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Staged Member Contributions</span>
                <div className="relative w-48">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search member..." 
                    value={inspectSearchTerm} 
                    onChange={e => setInspectSearchTerm(e.target.value)} 
                    className="h-8 pl-8 text-xs rounded-lg"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-bold">Staff Member</TableHead>
                      <TableHead className="text-xs font-bold">Period</TableHead>
                      <TableHead className="text-xs font-bold text-right">Amount</TableHead>
                      <TableHead className="text-xs font-bold">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(inspectBatch?.items || [])
                      .filter((it: any) => !inspectSearchTerm || (it.staffName && it.staffName.toLowerCase().includes(inspectSearchTerm.toLowerCase())) || (it.memberId && it.memberId.toLowerCase().includes(inspectSearchTerm.toLowerCase())))
                      .map((it: any, idx: number) => (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-semibold">{it.staffName || it.memberId}</TableCell>
                          <TableCell>{it.period}</TableCell>
                          <TableCell className="text-right font-bold text-foreground">{formatCurrency(it.amount, currency)}</TableCell>
                          <TableCell className="text-muted-foreground">{it.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Review & Approval Controls */}
            {!isBatchInitiatedByCurrentUser(inspectBatch) && (
              <div className="space-y-4 pt-4 border-t">
                {isReviewer && (inspectBatch?.status === 'pending_review' || inspectBatch?.status === 'revision_requested') && (
                  <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200/50 dark:border-blue-900/50 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">Phase 1: Reviewer Endorsement</p>
                    <Textarea 
                      value={reviewNotes} 
                      onChange={e => setReviewNotes(e.target.value)} 
                      placeholder="Enter audit review findings, reconciliation notes, or change requirements..." 
                      className="text-xs rounded-xl bg-background"
                      rows={2}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleReviewBatch('request_changes')} disabled={isSubmitting} className="rounded-xl text-xs font-bold border-amber-500/30 text-amber-700">
                        Request Changes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleReviewBatch('reject')} disabled={isSubmitting} className="rounded-xl text-xs font-bold border-destructive/30 text-destructive">
                        Reject Batch
                      </Button>
                      <Button size="sm" onClick={() => handleReviewBatch('endorse')} disabled={isSubmitting} className="rounded-xl text-xs font-bold bg-primary text-primary-foreground">
                        Endorse for Final Approval
                      </Button>
                    </div>
                  </div>
                )}

                {isSuperAdmin && (
                  <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/50 dark:border-emerald-900/50 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">Phase 2: Super Administrator Final Sign-Off</p>
                    <Textarea 
                      value={approvalNotes} 
                      onChange={e => setApprovalNotes(e.target.value)} 
                      placeholder="Enter final executive ratification justification to commit all contributions to official ledger..." 
                      className="text-xs rounded-xl bg-background"
                      rows={2}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleApproveBatch('reject')} disabled={isSubmitting} className="rounded-xl text-xs font-bold border-destructive/30 text-destructive">
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleApproveBatch('approve')} disabled={isSubmitting} className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Approve & Commit to Ledger
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t shrink-0">
            <Button variant="outline" onClick={() => setIsBatchModalOpen(false)} className="rounded-xl text-xs font-bold">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 2. INDIVIDUAL DEPOSIT SLIP MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isSlipModalOpen} onOpenChange={setIsSlipModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Deposit Verification</span>
              <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold">
                Pending Verification
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isSlipInitiatedByCurrentUser(inspectSlip) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You cannot verify your own deposit submission. Another administrator must verify it.</span>
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Member:</span>
              <span className="font-bold">{getMemberName(inspectSlip?.memberId)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-bold text-primary">{formatCurrency(inspectSlip?.amount, currency)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Period:</span>
              <span className="font-semibold">{inspectSlip?.period}</span>
            </div>
            {inspectSlip?.proofUrl && (
              <div className="pt-2">
                <a href={inspectSlip.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-bold inline-flex items-center gap-1 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> View Uploaded Deposit Slip
                </a>
              </div>
            )}
            {!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification *</Label>
                <Input 
                  value={slipJustification} 
                  onChange={e => setSlipJustification(e.target.value)} 
                  placeholder="e.g. Bank slip reference matched statement"
                  className="rounded-xl text-xs h-10"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 pt-3">
            <Button variant="ghost" onClick={() => setIsSlipModalOpen(false)} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            {!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="flex items-center gap-2">
                {(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionSlip('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                  >
                    Reject
                  </Button>
                )}
                {isReviewer && inspectSlip?.status === 'pending' && (
                  <Button 
                    onClick={() => handleActionSlip('review')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Review Deposit
                  </Button>
                )}
                {isSuperAdmin && inspectSlip?.status === 'reviewed' && (
                  <Button 
                    onClick={() => handleActionSlip('verify')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Approve Deposit
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 3. LOAN APPLICATION MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isLoanModalOpen} onOpenChange={setIsLoanModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Loan Facility Approval</span>
              <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold">
                {inspectLoan?.isTopUp ? 'Top-Up Request' : 'Standard Loan'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isLoanInitiatedByCurrentUser(inspectLoan) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You cannot approve your own loan application. Another administrator must audit it.</span>
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Applicant:</span>
              <span className="font-bold">{getMemberName(inspectLoan?.memberId)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-bold text-primary">{formatCurrency(inspectLoan?.amount, currency)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Purpose:</span>
              <span className="font-semibold">{inspectLoan?.description}</span>
            </div>
            {!isLoanInitiatedByCurrentUser(inspectLoan) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Approval / Audit Justification *</Label>
                <Input 
                  value={loanJustification} 
                  onChange={e => setLoanJustification(e.target.value)} 
                  placeholder="e.g. Credit audit passed, ratified under policy rate"
                  className="rounded-xl text-xs h-10"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 pt-3">
            <Button variant="ghost" onClick={() => setIsLoanModalOpen(false)} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            {!isLoanInitiatedByCurrentUser(inspectLoan) && (
              <div className="flex items-center gap-2">
                {(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionLoan('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                  >
                    Reject
                  </Button>
                )}
                {isReviewer && inspectLoan?.status === 'requested' && (
                  <Button 
                    onClick={() => handleActionLoan('review')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Review Loan
                  </Button>
                )}
                {isSuperAdmin && inspectLoan?.status === 'reviewed' && (
                  <Button 
                    onClick={() => handleActionLoan('approve')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Approve Loan
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 4. EXPENSE DETAILS MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Operating Expense Details</span>
              <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold">
                Pending Sign-Off
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isExpenseInitiatedByCurrentUser(inspectExpense) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You initiated this expense. Another administrator must review and sign off.</span>
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Title:</span>
              <span className="font-bold">{inspectExpense?.title}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-bold text-primary">{formatCurrency(inspectExpense?.amount, currency)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Category:</span>
              <span className="font-semibold">{inspectExpense?.category}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Recorded By:</span>
              <span className="font-semibold">{inspectExpense?.recordedByName || getMemberName(inspectExpense?.recordedBy)}</span>
            </div>
            {!isExpenseInitiatedByCurrentUser(inspectExpense) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Audit Sign-Off Notes (Optional)</Label>
                <Input 
                  value={expenseNotes} 
                  onChange={e => setExpenseNotes(e.target.value)} 
                  placeholder="e.g. Receipt verified, ratified for operational debit"
                  className="rounded-xl text-xs h-10"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 pt-3">
            <Button variant="ghost" onClick={() => setIsExpenseModalOpen(false)} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            {!isExpenseInitiatedByCurrentUser(inspectExpense) && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleActionExpense('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                >
                  Reject
                </Button>
                <Button 
                  onClick={() => handleActionExpense('approve')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Approve Expense
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 5. INTEREST DISTRIBUTION PROPOSAL MODAL (SCREENSHOT 2) */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isInterestModalOpen} onOpenChange={setIsInterestModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
          <DialogHeader className="p-5 bg-blue-600 text-white border-b border-blue-700/30 shrink-0">
            <DialogTitle className="text-base font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-white" />
                Interest Distribution Proposal #{inspectInterest?.id?.slice(0, 10)}
              </span>
              <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase">
                {inspectInterest?.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-xs mt-1">
              Initiated by <strong>{inspectInterest?.initiatedByName || 'Accountant'}</strong> on {safeFormatDate(inspectInterest?.createdAt, 'PPP')} &bull; Total Amount: <strong>{formatCurrency(inspectInterest?.totalInterestToDistribute || 0, currency)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* DUAL CONTROL RESTRICTION ALERT */}
            {isInterestInitiatedByCurrentUser(inspectInterest) && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Dual-Control Governance Restriction</p>
                  <p className="leading-relaxed">
                    You initiated this interest distribution proposal (<strong>{inspectInterest?.initiatedByName}</strong>). Under the cooperative dual-control rule, only another Super Administrator can review, approve, and execute the distribution.
                  </p>
                </div>
              </div>
            )}

            {/* Proposal Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Proposed Profit</p>
                <p className="text-base font-bold text-primary mt-0.5">{formatCurrency(inspectInterest?.totalInterestToDistribute || 0, currency)}</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Active Savers</p>
                <p className="text-base font-bold text-foreground mt-0.5">{inspectInterest?.recipientsCount || inspectInterest?.breakdown?.length || 0} Members</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">To Total Savings</p>
                <p className="text-base font-bold text-emerald-600 mt-0.5">{formatCurrency(inspectInterest?.totalCapitalizedToContributions || 0, currency)}</p>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Cash Payouts</p>
                <p className="text-base font-bold text-blue-600 mt-0.5">{formatCurrency(inspectInterest?.totalCashPayout || 0, currency)}</p>
              </div>
            </div>

            {/* Justification note */}
            <div className="p-3 bg-muted/30 rounded-xl border text-xs space-y-1">
              <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Audit Justification &amp; Resolution:</span>
              <p className="text-foreground italic">{inspectInterest?.justification || 'Pro-rata dividend allocation'}</p>
            </div>

            {/* Dividend Allocation Preview Table (Screenshot 2) */}
            <Card className="border border-border/80 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-blue-600 text-white p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                      <Users className="h-4 w-4" /> Dividend Allocation Preview
                    </CardTitle>
                    <CardDescription className="text-blue-100 text-xs mt-0.5">
                      Exact pro-rata dividend credit computed for each active saver based on their verified capital weight.
                    </CardDescription>
                  </div>
                  <Badge className="bg-white/20 text-white border-none text-[10px] font-bold self-start sm:self-auto">
                    Total: {formatCurrency(inspectInterest?.totalInterestToDistribute || 0, currency)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="p-3 border-b bg-muted/20 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    placeholder="Filter members in preview..." 
                    value={interestMemberFilter}
                    onChange={e => setInterestMemberFilter(e.target.value)}
                    className="pl-8 h-8 rounded-lg text-xs bg-background"
                  />
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">
                  Showing {modalFilteredBreakdown.length} of {inspectInterest?.breakdown?.length || 0} savers
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <Table className="min-w-[620px]">
                  <TableHeader className="bg-blue-600/90 text-white">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="text-white font-bold text-xs py-3 px-4 uppercase">Member Saver</TableHead>
                      <TableHead className="text-white font-bold text-xs text-right uppercase">Savings</TableHead>
                      <TableHead className="text-white font-bold text-xs text-right uppercase">Share %</TableHead>
                      <TableHead className="text-white font-bold text-xs text-right text-emerald-200 uppercase">+ Dividend</TableHead>
                      <TableHead className="text-white font-bold text-xs text-center uppercase">Payout Election</TableHead>
                      <TableHead className="text-white font-bold text-xs text-right pr-4 uppercase">Projected Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalFilteredBreakdown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-28 text-center text-muted-foreground italic text-xs">
                          No savers match the search filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      modalFilteredBreakdown.map((saver: any) => (
                        <TableRow key={saver.memberId} className="hover:bg-muted/30 text-xs">
                          <TableCell className="py-3 px-4 font-semibold">
                            <div>{saver.memberName}</div>
                            {saver.memberEmail && (
                              <div className="text-[10px] text-muted-foreground font-normal">{saver.memberEmail}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(saver.contributions, currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-primary font-bold">
                            {saver.sharePercentage || (saver.shareRatio ? (saver.shareRatio * 100).toFixed(2) : '0.00')}%
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-bold">
                            +{formatCurrency(saver.distributedShare, currency)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn(
                              "text-[9px] uppercase font-bold",
                              saver.payoutType === 'add_to_contribution' 
                                ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/5" 
                                : "border-blue-500/30 text-blue-700 bg-blue-500/5"
                            )}>
                              {saver.payoutType === 'add_to_contribution' ? 'To Savings' : 'Cash Payout'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-4 font-medium text-foreground">
                            {saver.payoutType === 'add_to_contribution' 
                              ? `Savings: ${formatCurrency(saver.projectedSavings || (saver.contributions + saver.distributedShare), currency)}`
                              : `Accrued: ${formatCurrency(saver.projectedAccruedInterest || (saver.previousAccruedInterest + saver.distributedShare), currency)}`}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            </Card>

            {/* Approval Controls */}
            {!isInterestInitiatedByCurrentUser(inspectInterest) && isSuperAdmin && inspectInterest?.status === 'pending' && (
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/50 dark:border-emerald-900/50 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                  Super Administrator Ratification &amp; Ledger Execution
                </p>
                <Textarea 
                  value={interestApprovalNotes} 
                  onChange={e => setInterestApprovalNotes(e.target.value)} 
                  placeholder="Enter final executive ratification justification to distribute profits and credit member accounts..." 
                  className="text-xs rounded-xl bg-background"
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t shrink-0 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setIsInterestModalOpen(false)} className="rounded-xl text-xs font-bold">
              Close
            </Button>
            {!isInterestInitiatedByCurrentUser(inspectInterest) && isSuperAdmin && inspectInterest?.status === 'pending' && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleActionInterest('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  Reject Proposal
                </Button>
                <Button 
                  onClick={() => handleActionInterest('approve')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white gap-1.5 shadow-md"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Approve &amp; Distribute {formatCurrency(inspectInterest?.totalInterestToDistribute || 0, currency)}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. ACCOUNT DELETION INSPECTION & APPROVAL MODAL */}
      <Dialog open={isDeletionModalOpen} onOpenChange={setIsDeletionModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
          <DialogHeader className="p-5 bg-red-600 text-white border-b border-red-700/30 shrink-0">
            <DialogTitle className="text-base font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <UserX className="h-5 w-5" /> Account Deletion Request
              </span>
              <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase">
                {inspectDeletion?.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-red-100 text-xs mt-1">
              Member ID: {inspectDeletion?.userId} | Requested on {safeFormatDate(inspectDeletion?.requestedAt, 'PPP')}
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Member Profile Summary */}
            <div className="flex items-center gap-3 p-3.5 bg-muted/40 rounded-xl border border-border">
              <Avatar className="h-11 w-11 border-2 border-primary/20">
                <AvatarFallback className="font-bold text-xs bg-primary/10 text-primary">
                  {inspectDeletion?.userName?.slice(0, 2)?.toUpperCase() || 'M'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-foreground">{inspectDeletion?.userName || 'Member'}</p>
                <p className="text-xs text-muted-foreground truncate">{inspectDeletion?.userEmail}</p>
                {inspectDeletion?.userPhone && <p className="text-[11px] text-muted-foreground">{inspectDeletion?.userPhone}</p>}
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase">
                {inspectDeletion?.userRole || 'member'}
              </Badge>
            </div>

            {/* Member's stated reason */}
            <div className="space-y-1.5 p-3.5 bg-muted/20 rounded-xl border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Member&apos;s Reason for Leaving:
              </span>
              <p className="text-xs text-foreground italic bg-background p-2.5 rounded-lg border border-border/60">
                &ldquo;{inspectDeletion?.reason}&rdquo;
              </p>
            </div>

            {/* Financial Clearance Audit Cards */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Financial Clearance Audit:
              </span>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-muted/30 rounded-xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Verified Savings</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(inspectDeletion?.savingsBalance || 0, currency)}
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Accrued Interest</p>
                  <p className="text-sm font-bold text-emerald-600 mt-0.5">
                    +{formatCurrency(inspectDeletion?.accruedInterest || 0, currency)}
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Active Loan Debt</p>
                  <p className={cn(
                    "text-sm font-bold mt-0.5",
                    Number(inspectDeletion?.activeLoanBalance || 0) > 0 ? "text-destructive" : "text-emerald-600"
                  )}>
                    {formatCurrency(inspectDeletion?.activeLoanBalance || 0, currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* High-Stakes Warning Alert */}
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-900 dark:text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Permanent Account Action</p>
                <p className="text-[11px] leading-relaxed">
                  Approving this request will permanently revoke the user&apos;s authentication access and remove their member record from the active directory. An immutable log entry will be preserved in the audit trail. Any payout of member savings must be executed according to scheme bylaws.
                </p>
              </div>
            </div>

            {/* Previous Review details if not pending */}
            {inspectDeletion?.status !== 'pending' && (
              <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-1 text-xs">
                <p className="font-bold text-foreground">
                  Reviewed by: {inspectDeletion?.reviewedByName || 'Super Admin'} on {safeFormatDate(inspectDeletion?.reviewedAt, 'PPP')}
                </p>
                {inspectDeletion?.adminNotes && (
                  <p className="text-muted-foreground">Admin Notes: {inspectDeletion.adminNotes}</p>
                )}
                {inspectDeletion?.rejectionReason && (
                  <p className="text-destructive font-medium">Rejection Reason: {inspectDeletion.rejectionReason}</p>
                )}
              </div>
            )}

            {/* Action Inputs for Super Admin */}
            {inspectDeletion?.status === 'pending' && isSuperAdmin && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Admin Approval Notes (Optional)
                  </Label>
                  <Textarea
                    value={deletionAdminNotes}
                    onChange={e => setDeletionAdminNotes(e.target.value)}
                    placeholder="Enter administrative closure notes or payout settlement confirmation..."
                    className="text-xs rounded-xl bg-background min-h-[60px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Rejection Justification (Required only if rejecting)
                  </Label>
                  <Input
                    value={deletionRejectionReason}
                    onChange={e => setDeletionRejectionReason(e.target.value)}
                    placeholder="State reason why deletion cannot be granted at this time..."
                    className="text-xs rounded-xl bg-background h-9"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t shrink-0 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setIsDeletionModalOpen(false)} className="rounded-xl text-xs font-bold">
              Close
            </Button>
            {inspectDeletion?.status === 'pending' && isSuperAdmin && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleActionDeletion('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  Reject Request
                </Button>
                <Button 
                  onClick={() => handleActionDeletion('approve')} 
                  disabled={isSubmitting || Number(inspectDeletion?.activeLoanBalance || 0) > 0}
                  className="rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-1.5 shadow-md"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Approve &amp; Delete Account
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 7. SUPER ADMIN DIRECT ACCOUNT DELETION MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isDirectDeleteModalOpen} onOpenChange={setIsDirectDeleteModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
          <DialogHeader className="p-5 bg-red-600 text-white border-b border-red-700/30 shrink-0">
            <DialogTitle className="text-base font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <UserX className="h-5 w-5" /> Direct Account Deletion
              </span>
              <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase">
                Super Admin Override
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-red-100 text-xs mt-1">
              Directly purge a member account and revoke credentials without requiring a prior member request.
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {/* Member Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                Select Member to Delete <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedDirectDeleteMemberId} onValueChange={setSelectedDirectDeleteMemberId}>
                <SelectTrigger className="h-11 rounded-xl bg-muted border-none text-xs">
                  <SelectValue placeholder="Choose a registered member..." />
                </SelectTrigger>
                <SelectContent className="max-h-56 rounded-xl">
                  {members
                    .filter((m: any) => m.id !== user?.uid)
                    .map((m: any) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name || 'Unknown'} ({m.email}) - {m.role || 'member'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Member Financial Overview */}
            {selectedDirectDeleteMember && (
              <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-bold text-xs text-foreground">{selectedDirectDeleteMember.name}</p>
                    <p className="text-[10px] text-muted-foreground">{selectedDirectDeleteMember.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase font-bold">
                    {selectedDirectDeleteMember.role || 'member'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                  <div className="p-2 bg-background rounded-lg border">
                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Savings</p>
                    <p className="text-xs font-bold text-foreground mt-0.5">
                      {formatCurrency(selectedMemberTotalSavings, currency)}
                    </p>
                  </div>
                  <div className="p-2 bg-background rounded-lg border">
                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Accrued Interest</p>
                    <p className="text-xs font-bold text-emerald-600 mt-0.5">
                      +{formatCurrency(selectedDirectDeleteMember.accruedInterest || 0, currency)}
                    </p>
                  </div>
                  <div className="p-2 bg-background rounded-lg border">
                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Active Debt</p>
                    <p className={cn(
                      "text-xs font-bold mt-0.5",
                      selectedMemberDebt > 0 ? "text-destructive" : "text-emerald-600"
                    )}>
                      {formatCurrency(selectedMemberDebt, currency)}
                    </p>
                  </div>
                </div>

                {selectedMemberDebt > 0 && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-900 dark:text-red-200 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="leading-tight">
                      This member has an outstanding loan balance of <strong>{formatCurrency(selectedMemberDebt, currency)}</strong>. Deletion is blocked until all debt is repaid.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Warning Callout */}
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-900 dark:text-red-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Direct deletion immediately revokes the member&apos;s authentication credentials, erases their user document, and writes an immutable entry into the audit trail.
              </p>
            </div>

            {/* Administrative Justification */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                Administrative Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={directDeleteJustification}
                onChange={e => setDirectDeleteJustification(e.target.value)}
                placeholder="State official reason for direct deletion without member request (e.g. Disciplinary revocation, member deceased, scheme liquidation)..."
                required
                rows={3}
                className="text-xs rounded-xl bg-muted border-none resize-none"
              />
            </div>
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t shrink-0 flex items-center justify-between gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDirectDeleteModalOpen(false);
                setSelectedDirectDeleteMemberId('');
                setDirectDeleteJustification('');
              }} 
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDirectDeleteMember}
              disabled={isSubmitting || !selectedDirectDeleteMemberId || !directDeleteJustification.trim() || selectedMemberDebt > 0}
              className="rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-1.5 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Confirm &amp; Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
