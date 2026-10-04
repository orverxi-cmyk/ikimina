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
  X
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, limit, where } from 'firebase/firestore';
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
  verifyContributionAction,
  rejectContributionAction,
  bulkVerifyContributionsAction,
  bulkRejectContributionsAction,
  approveLoanAction,
  rejectLoanAction,
  approveExpenseAction,
  rejectExpenseAction
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
  const isSuperAdmin = userRole === 'admin';
  const isReviewer = userRole === 'reviewer' || userRole === 'management' || userRole === 'admin';
  const isAccountant = userRole === 'accountant' || userRole === 'admin';

  const [mainTab, setMainTab] = useState<'batches' | 'deposits' | 'loans' | 'expenses' | 'upload'>('batches');
  const [batchSubTab, setBatchSubTab] = useState<'pending' | 'all'>('pending');

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

  // Firestore Data Subscriptions
  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), [firestore]);
  const { data: membersSnap } = useCollection(membersQuery);

  const batchesQuery = useMemoFirebase(() => query(collection(firestore, 'contribution_batches'), orderBy('initiatedAt', 'desc'), limit(100)), [firestore]);
  const { data: batchesSnap, loading: loadingBatches } = useCollection(batchesQuery);

  const pendingSlipsQuery = useMemoFirebase(() => query(collection(firestore, 'contributions'), where('status', '==', 'pending'), limit(100)), [firestore]);
  const { data: pendingSlipsSnap, loading: loadingSlips } = useCollection(pendingSlipsQuery);

  const pendingLoansQuery = useMemoFirebase(() => query(collection(firestore, 'loans'), where('status', '==', 'requested'), limit(50)), [firestore]);
  const { data: pendingLoansSnap, loading: loadingLoans } = useCollection(pendingLoansQuery);

  const pendingExpensesQuery = useMemoFirebase(() => query(collection(firestore, 'expenses'), where('status', '==', 'pending'), limit(50)), [firestore]);
  const { data: pendingExpensesSnap, loading: loadingExpenses } = useCollection(pendingExpensesQuery);

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

  const totalPendingItems = pendingBatches.length + pendingSlips.length + pendingLoans.length + pendingExpenses.length;

  const getMemberName = (id: string) => {
    if (!id) return 'Unknown Member';
    if (id === user?.uid) return userData?.name || 'Me';
    return (memberMap.get(id) as any)?.name || 'Unknown Member';
  };

  // -------------------------------------------------------------
  // SEGREGATION OF DUTIES HELPERS (DUAL-CONTROL RULE)
  // "If an admin initiates a process, the same admin should never be able to approve it"
  // -------------------------------------------------------------
  const isBatchInitiatedByCurrentUser = (batch: any) => Boolean(user && batch && batch.initiatedBy === user.uid);
  const isSlipInitiatedByCurrentUser = (slip: any) => Boolean(user && slip && (slip.memberId === user.uid || slip.recordedBy === user.uid));
  const isLoanInitiatedByCurrentUser = (loan: any) => Boolean(user && loan && loan.memberId === user.uid);
  const isExpenseInitiatedByCurrentUser = (exp: any) => Boolean(user && exp && (exp.recordedBy === user.uid || exp.createdBy === user.uid));

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
  const handleActionSlip = async (decision: 'verify' | 'reject') => {
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
  const handleActionLoan = async (decision: 'approve' | 'reject') => {
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
      if (decision === 'approve') {
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
            Audit, inspect, and approve pending batches, member deposits, loan requests, and operational expenses.
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
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-5 h-11">
            <TabsTrigger value="batches" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Contribution Batches {pendingBatches.length > 0 && `(${pendingBatches.length})`}
            </TabsTrigger>
            <TabsTrigger value="deposits" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Member Deposits {pendingSlips.length > 0 && `(${pendingSlips.length})`}
            </TabsTrigger>
            <TabsTrigger value="loans" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <HandCoins className="h-3.5 w-3.5" /> Loan Requests {pendingLoans.length > 0 && `(${pendingLoans.length})`}
            </TabsTrigger>
            <TabsTrigger value="expenses" className="uppercase tracking-wider text-[11px] px-3 whitespace-nowrap gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> Expenses {pendingExpenses.length > 0 && `(${pendingExpenses.length})`}
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

        {/* 5. NEW BATCH UPLOAD TAB */}
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
                      <TableHead className="text-xs font-bold">Member Name</TableHead>
                      <TableHead className="text-xs font-bold">Period</TableHead>
                      <TableHead className="text-xs font-bold text-right">Amount</TableHead>
                      <TableHead className="text-xs font-bold">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(inspectBatch?.items || [])
                      .filter((i: any) => !inspectSearchTerm || (i.staffName && i.staffName.toLowerCase().includes(inspectSearchTerm.toLowerCase())) || (i.memberId && i.memberId.includes(inspectSearchTerm)))
                      .map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs font-semibold">{item.staffName || getMemberName(item.memberId)}</TableCell>
                          <TableCell className="text-xs">{item.period || inspectBatch?.defaultPeriod}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground">{formatCurrency(item.amount, currency)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.notes || '-'}</TableCell>
                        </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Actions / Decision Section */}
            {!isBatchInitiatedByCurrentUser(inspectBatch) && (inspectBatch?.status === 'pending_review' || inspectBatch?.status === 'pending_approval' || inspectBatch?.status === 'revision_requested') && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider">
                  {inspectBatch.status === 'pending_review' || inspectBatch.status === 'revision_requested' ? 'Reviewer Endorsement Notes' : 'Super Administrator Approval Notes'} *
                </Label>
                <Textarea 
                  value={inspectBatch.status === 'pending_review' || inspectBatch.status === 'revision_requested' ? reviewNotes : approvalNotes}
                  onChange={e => inspectBatch.status === 'pending_review' || inspectBatch.status === 'revision_requested' ? setReviewNotes(e.target.value) : setApprovalNotes(e.target.value)}
                  placeholder="Enter audit justification and notes..."
                  className="rounded-xl bg-background text-xs min-h-[70px]"
                />
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/30 border-t flex items-center justify-between shrink-0 flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setIsBatchModalOpen(false)} className="rounded-xl font-bold text-xs">
              Close
            </Button>

            <div className="flex items-center gap-2">
              {isBatchInitiatedByCurrentUser(inspectBatch) ? (
                <Badge variant="outline" className="text-xs font-bold text-amber-600 border-amber-500/30 p-2">
                  <Lock className="h-3.5 w-3.5 mr-1" /> Awaiting Another Administrator's Approval
                </Badge>
              ) : inspectBatch?.status === 'pending_review' || inspectBatch?.status === 'revision_requested' ? (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => handleReviewBatch('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl font-bold text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    Reject
                  </Button>
                  <Button 
                    onClick={() => handleReviewBatch('endorse')} 
                    disabled={isSubmitting}
                    className="rounded-xl font-bold text-xs bg-primary text-primary-foreground"
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                    Endorse Batch
                  </Button>
                </>
              ) : inspectBatch?.status === 'pending_approval' && isSuperAdmin ? (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => handleApproveBatch('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl font-bold text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    Reject Batch
                  </Button>
                  <Button 
                    onClick={() => handleApproveBatch('approve')} 
                    disabled={isSubmitting}
                    className="rounded-xl font-bold text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    Approve &amp; Commit to Ledger
                  </Button>
                </>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 2. DEPOSIT SLIP DETAILS MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isSlipModalOpen} onOpenChange={setIsSlipModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Member Deposit Details</span>
              <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold">
                Pending Verification
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isSlipInitiatedByCurrentUser(inspectSlip) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You submitted this deposit slip. Dual-control policy requires another admin to verify it.</span>
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
                <Button asChild variant="outline" className="w-full rounded-xl font-bold text-xs gap-1.5">
                  <a href={inspectSlip.proofUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 text-primary" /> Inspect Uploaded Proof Document
                  </a>
                </Button>
              </div>
            )}
            {!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Verification Justification *</Label>
                <Input 
                  value={slipJustification} 
                  onChange={e => setSlipJustification(e.target.value)} 
                  placeholder="e.g. Bank slip confirmed against institutional account"
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
                <Button 
                  variant="outline" 
                  onClick={() => handleActionSlip('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                >
                  Reject
                </Button>
                <Button 
                  onClick={() => handleActionSlip('verify')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Verify &amp; Commit
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* 3. LOAN DETAILS MODAL */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isLoanModalOpen} onOpenChange={setIsLoanModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Loan Facility Details</span>
              <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold">
                Requested
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isLoanInitiatedByCurrentUser(inspectLoan) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You cannot approve your own loan application. Another administrator must approve it.</span>
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
                <Button 
                  variant="outline" 
                  onClick={() => handleActionLoan('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                >
                  Reject
                </Button>
                <Button 
                  onClick={() => handleActionLoan('approve')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Approve Loan
                </Button>
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
    </div>
  );
}
