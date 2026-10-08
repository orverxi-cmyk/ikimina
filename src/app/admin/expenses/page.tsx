'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Receipt, 
  Plus, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  ExternalLink, 
  AlertTriangle, 
  UploadCloud, 
  X, 
  FileCheck, 
  TrendingDown, 
  Clock, 
  DollarSign, 
  ArrowLeft,
  Building2,
  Calendar,
  ShieldCheck,
  Ban
} from "lucide-react";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from '@/firebase';
import { 
  lodgeExpenseAction, 
  reviewExpenseAction,
  approveExpenseAction, 
  rejectExpenseAction 
} from '@/lib/finance-client';
import Link from 'next/link';

const EXPENSE_CATEGORIES = [
  "Office & Administrative",
  "Bank & Transaction Fees",
  "Professional, Legal & Audit",
  "Technology & IT Systems",
  "Logistics & Transport",
  "Annual General Meeting & Events",
  "Utilities & Telecom",
  "Miscellaneous Operations"
];

export default function ExpensesAdminPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  // Role resolution with persistent cache & primary admin check
  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const [cachedRole, setCachedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  // Subscriptions
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  const effectiveRole = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'management' || isPrimaryAdmin;
  const isAccountant = effectiveRole === 'accountant' || effectiveRole === 'senior_accountant';
  const canInitiate = effectiveRole === 'accountant' || effectiveRole === 'senior_accountant';
  const isSeniorAcct = effectiveRole === 'senior_accountant';
  const isComplianceReviewer = effectiveRole === 'reviewer' || effectiveRole === 'management';
  const canReview = isSeniorAcct || isComplianceReviewer;
  const canApprove = effectiveRole === 'admin' || effectiveRole === 'management' || isPrimaryAdmin;

  // Query expenses collection directly without field restrictions (ensures no documents are omitted by Firestore)
  const expensesQuery = useMemoFirebase(() => {
    return collection(firestore, 'expenses');
  }, [firestore]);
  const { data: expensesSnap, loading } = useCollection(expensesQuery);
  const expenses = useMemo(() => {
    if (!expensesSnap) return [];
    return expensesSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => {
        const getTime = (item: any) => {
          if (item.createdAt?.toMillis) return item.createdAt.toMillis();
          if (item.lodgedAt?.toMillis) return item.lodgedAt.toMillis();
          if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
          if (item.lodgedAt?.toDate) return item.lodgedAt.toDate().getTime();
          if (item.expenseDate) return new Date(item.expenseDate).getTime();
          return 0;
        };
        return getTime(b) - getTime(a);
      });
  }, [expensesSnap]);

  // Modals state
  const [isLodgeOpen, setIsLodgeOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  
  // File upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Action state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Segregated Expense Lists
  const pendingExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'pending' || e.status === 'pending_review' || e.status === 'pending_reviewer' || e.status === 'pending_approval'), [expenses]);
  const approvedExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'approved'), [expenses]);
  const rejectedExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'rejected'), [expenses]);

  // Aggregate stats
  const totalApprovedAmount = useMemo(() => {
    return approvedExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }, [approvedExpenses]);

  const totalPendingAmount = useMemo(() => {
    return pendingExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }, [pendingExpenses]);

  // File Upload Handlers
  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setReceiptFile(file);
    setReceiptFileName(file.name);
    setIsUploadingFile(true);

    try {
      const storage = getStorage(initializeFirebase().app);
      const fileRef = ref(storage, `expense_receipts/${user.uid}/${Date.now()}_${file.name}`);
      const uploadResult = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(uploadResult.ref);
      setReceiptUrl(url);
      toast({
        title: "Receipt Uploaded",
        description: `${file.name} attached successfully.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message || "Failed to upload receipt."
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptUrl('');
    setReceiptFileName('');
  };

  // Submit Lodge Form
  const handleLodgeExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid expense amount." });
      return;
    }

    if (!receiptUrl && !receiptFile) {
      toast({ 
        variant: "destructive", 
        title: "Supporting Document Required", 
        description: "Please upload an official receipt, voucher, or invoice justifying this expense." 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalDocUrl = receiptUrl;
      if (!finalDocUrl && receiptFile) {
        setIsUploadingFile(true);
        const storage = getStorage(initializeFirebase().app);
        const fileRef = ref(storage, `expense_receipts/${user.uid}/${Date.now()}_${receiptFile.name}`);
        const uploadResult = await uploadBytes(fileRef, receiptFile);
        finalDocUrl = await getDownloadURL(uploadResult.ref);
        setReceiptUrl(finalDocUrl);
        setIsUploadingFile(false);
      }

      await lodgeExpenseAction({
        title,
        category,
        amount: numericAmount,
        description,
        expenseDate,
        receiptUrl: finalDocUrl,
        receiptFileName: receiptFile?.name || receiptFileName || 'receipt_document'
      });

      toast({
        title: "Expense Lodged Successfully",
        description: "The expense has been submitted to Administrator for review and asset deduction approval."
      });

      // Reset
      setTitle('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setAmount('');
      setDescription('');
      handleRemoveReceipt();
      setIsLodgeOpen(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Lodgement Failed",
        description: err.message || "Could not lodge expense."
      });
    } finally {
      setIsSubmitting(false);
      setIsUploadingFile(false);
    }
  };

  // Review Expense Handler (Reviewer / Senior Accountant)
  const handleReview = async (decision: 'endorse' | 'request_changes' | 'reject') => {
    if (!selectedExpense || !canReview) return;
    setIsSubmitting(true);
    try {
      await reviewExpenseAction({
        expenseId: selectedExpense.id,
        decision,
        reviewNotes: reviewNotes.trim() || undefined
      });

      toast({
        title: decision === 'endorse' ? "Expense Submitted for Review" : decision === 'request_changes' ? "Revision Requested" : "Expense Rejected",
        description: decision === 'endorse' 
          ? "Expense has been submitted for compliance review."
          : `Expense review decision recorded: ${decision}.`
      });

      setIsReviewOpen(false);
      setSelectedExpense(null);
      setReviewNotes('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Review Failed",
        description: err.message || "Could not submit review."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Submit for Review Handler (Senior Accountant table row action)
  const [isDirectSubmitting, setIsDirectSubmitting] = useState<string | null>(null);
  const handleDirectSubmitForReview = async (exp: any) => {
    if (!isSeniorAcct) return;
    setIsDirectSubmitting(exp.id);
    try {
      await reviewExpenseAction({
        expenseId: exp.id,
        decision: 'endorse',
        reviewNotes: undefined
      });
      toast({
        title: "Expense Submitted for Review",
        description: "The expense has been endorsed and forwarded to the Compliance Reviewer."
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: err.message || "Could not submit expense for review."
      });
    } finally {
      setIsDirectSubmitting(null);
    }
  };

  // Approve Expense Handler (Administrator)
  const handleApprove = async () => {
    if (!selectedExpense || !canApprove) return;
    setIsSubmitting(true);
    try {
      await approveExpenseAction({
        expenseId: selectedExpense.id,
        adminNotes: adminNotes.trim() || undefined
      });

      toast({
        title: "Expense Approved",
        description: `${formatCurrency(selectedExpense.amount, currency)} has been approved and subtracted from total institutional assets.`
      });

      setIsReviewOpen(false);
      setSelectedExpense(null);
      setAdminNotes('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: err.message || "Could not approve expense."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject Expense Handler
  const handleReject = async () => {
    if (!selectedExpense || !isAdmin) return;
    if (!rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for rejecting this expense."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await rejectExpenseAction({
        expenseId: selectedExpense.id,
        rejectionReason: rejectionReason.trim(),
        adminNotes: adminNotes.trim() || undefined
      });

      toast({
        title: "Expense Rejected",
        description: "The expense request has been rejected."
      });

      setIsRejectOpen(false);
      setIsReviewOpen(false);
      setSelectedExpense(null);
      setRejectionReason('');
      setAdminNotes('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: err.message || "Could not reject expense."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Button variant="ghost" size="icon" asChild className="h-7 w-7 rounded-full -ml-2 text-muted-foreground hover:text-foreground">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              Financial Control
            </Badge>
          </div>
          <h1 className="text-[13px] font-bold font-headline tracking-tight text-foreground flex items-center gap-2">
            Operating Expenses &amp; Outflows
          </h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            Lodge, review, and authorize operational expenses. Approved disbursements are authoritatively subtracted from total institutional assets.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canInitiate && (
            <Button 
              onClick={() => setIsLodgeOpen(true)}
              className="rounded-xl font-bold text-[12px] gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" /> Lodge New Expense
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Approved Expenses (Subtracted from Assets) */}
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px] font-bold uppercase tracking-wider text-foreground">
              Total Approved Expenses
            </CardTitle>
            <div className="p-2.5 bg-muted rounded-xl text-foreground">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-foreground">
              -{formatCurrency(totalApprovedAmount, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              Subtracted from Total Assets ({approvedExpenses.length} entries)
            </p>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card className="shadow-sm border border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">
              Pending Authorization
            </CardTitle>
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-primary">
              {formatCurrency(totalPendingAmount, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              {pendingExpenses.length} awaiting Admin sign-off
            </p>
          </CardContent>
        </Card>

        {/* Total Expenses Logged */}
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Expenses Lodged
            </CardTitle>
            <div className="p-2.5 bg-muted rounded-xl text-muted-foreground">
              <Receipt className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-foreground">
              {expenses.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Historical ledger vouchers
            </p>
          </CardContent>
        </Card>

        {/* Governance Model */}
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dual-Control Protocol
            </CardTitle>
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-foreground">
              Accountant Lodges
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Admin Authorizes &amp; Commits
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Hub: Pending, Approved, Rejected */}
      <Tabs defaultValue="pending" className="space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-3 h-11 p-1 bg-muted rounded-xl border border-border/60 gap-1">
            <TabsTrigger value="pending" className="gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Clock className="h-3.5 w-3.5" />
              Pending Approval
              <Badge data-tab-count="true" className="tab-badge font-mono text-[10px] h-4 min-w-4 px-1.5 rounded-full border-none transition-colors">
                {pendingExpenses.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved Expenses
              <Badge data-tab-count="true" className="tab-badge font-mono text-[10px] h-4 min-w-4 px-1.5 rounded-full border-none transition-colors">
                {approvedExpenses.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <XCircle className="h-3.5 w-3.5" />
              Rejected
              <Badge data-tab-count="true" className="tab-badge font-mono text-[10px] h-4 min-w-4 px-1.5 rounded-full border-none transition-colors">
                {rejectedExpenses.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. Pending Approvals Tab */}
        <TabsContent value="pending" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-lg font-bold text-white">Expenses Awaiting Administrator Sign-Off</CardTitle>
              <CardDescription className="text-blue-100 text-xs">
                Expenses lodged by the Accountant. Inspect the attached supporting documents before committing to the institutional asset deduction.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Date &amp; Payee</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Category</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Amount</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Stage</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Lodged By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Supporting Proof</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : pendingExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40 text-center text-muted-foreground italic">
                        No pending expenses awaiting approval.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingExpenses.map((exp: any) => (
                      <TableRow key={exp.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {exp.expenseDate || (exp.createdAt?.toDate ? format(exp.createdAt.toDate(), 'PPP') : (exp.lodgedAt?.toDate ? format(exp.lodgedAt.toDate(), 'PPP') : 'Recent'))}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {exp.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-sm text-foreground">
                          {formatCurrency(exp.amount, currency)}
                        </TableCell>
                        <TableCell>
                          {exp.status === 'pending_approval' ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border border-amber-200 text-[10px] font-semibold">
                              Pending Admin Sign-Off
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-500/10 text-blue-600 border border-blue-200 text-[10px] font-semibold">
                              Pending Review
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{exp.lodgedByName || 'Accountant'}</p>
                          <p className="text-[10px] text-muted-foreground">{exp.lodgedByEmail}</p>
                        </TableCell>
                        <TableCell>
                          {exp.receiptUrl ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              asChild 
                              className="h-8 text-xs font-bold gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="max-w-[120px] truncate">{exp.receiptFileName || 'View Receipt'}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Senior Accountant on a pending_review / pending / revision_requested expense gets a direct Submit for Review button */}
                          {isSeniorAcct && (exp.status === 'pending_review' || exp.status === 'pending' || exp.status === 'revision_requested') ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedExpense(exp);
                                  setIsReviewOpen(true);
                                }}
                                className="rounded-xl font-bold text-xs h-8 px-3 gap-1 text-muted-foreground hover:text-foreground"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                disabled={isDirectSubmitting === exp.id}
                                onClick={() => handleDirectSubmitForReview(exp)}
                                className="rounded-xl font-bold text-xs h-8 px-3 gap-1 shadow-sm bg-green-600 hover:bg-green-700 text-white"
                              >
                                {isDirectSubmitting === exp.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <FileCheck className="h-3 w-3" />
                                )}
                                Submit for Review
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedExpense(exp);
                                setIsReviewOpen(true);
                              }}
                              className="rounded-xl font-bold text-xs h-8 px-3 gap-1 shadow-sm"
                            >
                              {exp.status === 'pending_approval' ? (
                                canApprove ? 'Authorize & Sign-Off' : 'View Details'
                              ) : exp.status === 'pending_reviewer' ? (
                                isComplianceReviewer ? 'Review' : 'Awaiting Reviewer'
                              ) : (
                                'View Details'
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Approved Expenses Tab */}
        <TabsContent value="approved" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-white">Approved Institutional Outflows</CardTitle>
                  <CardDescription className="text-blue-100 text-xs">
                    Audited expenses subtracted from total institutional assets.
                  </CardDescription>
                </div>
                <Badge className="bg-white/20 text-white font-mono text-xs font-bold px-3 py-1 border-none">
                  Total Deducted: {formatCurrency(totalApprovedAmount, currency)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Title &amp; Date</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Category</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Amount Deducted</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Authorized By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Receipt Proof</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : approvedExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">
                        No approved expenses recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    approvedExpenses.map((exp: any) => (
                      <TableRow key={exp.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {exp.expenseDate || (exp.createdAt?.toDate ? format(exp.createdAt.toDate(), 'PPP') : (exp.lodgedAt?.toDate ? format(exp.lodgedAt.toDate(), 'PPP') : 'Recorded'))}
                          </p>
                          {exp.description && (
                            <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate max-w-[200px]">
                              {exp.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {exp.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-sm text-foreground">
                          -{formatCurrency(exp.amount, currency)}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-semibold text-foreground">{exp.approvedByName || 'Admin'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {exp.approvedAt?.toDate ? format(exp.approvedAt.toDate(), 'MMM d, yyyy') : 'Authorized'}
                          </p>
                        </TableCell>
                        <TableCell>
                          {exp.receiptUrl ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              asChild 
                              className="h-8 text-xs font-bold gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="max-w-[120px] truncate">{exp.receiptFileName || 'Receipt'}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-none font-bold text-[10px] uppercase">
                            Deducted
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Rejected Expenses Tab */}
        <TabsContent value="rejected" className="space-y-4">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-lg font-bold text-white">Rejected Operational Expenses</CardTitle>
              <CardDescription className="text-blue-100 text-xs">
                Expenses turned down by Administrators during audit review. Not deducted from assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Title &amp; Date</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Category</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Amount</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Lodged By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Rejection Reason</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejectedExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">
                        No rejected expenses recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rejectedExpenses.map((exp: any) => (
                      <TableRow key={exp.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground">{exp.expenseDate}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {exp.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-sm text-muted-foreground line-through">
                          {formatCurrency(exp.amount, currency)}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{exp.lodgedByName}</p>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-xs text-destructive font-medium italic">
                            &ldquo;{exp.rejectionReason}&rdquo;
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive" className="font-bold text-[10px] uppercase">
                            Rejected
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: LODGE EXPENSE (Accountant / Admin) */}
      <Dialog open={isLodgeOpen} onOpenChange={setIsLodgeOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl rounded-2xl bg-card border shadow-2xl p-0 overflow-hidden">
          <form onSubmit={handleLodgeExpense} className="flex flex-col">
            <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 bg-muted/30 border-b">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-widest">
                  Accountant Desk
                </Badge>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-bold font-headline">Lodge Operational Expense</DialogTitle>
              <DialogDescription className="text-xs">
                Submit an institutional operational outflow with mandatory supporting voucher or receipt.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-1 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">Title / Payee *</Label>
                  <Input 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Office Supplies, Bank Audit Fees, AGM Catering"
                    required
                    className="h-10 rounded-xl bg-muted/40 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Category *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-10 rounded-xl bg-muted/40 text-xs font-medium">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(c => (
                        <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Expense Date *</Label>
                  <Input 
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                    className="h-10 rounded-xl bg-muted/40 text-xs"
                  />
                </div>

                <div className="space-y-1.5 col-span-1 sm:col-span-2">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                    <Label className="text-xs font-bold uppercase tracking-wider">Expense Amount ({currency}) *</Label>
                    <span className="text-[10px] text-muted-foreground font-bold">Subtracted from Total Assets on Approval</span>
                  </div>
                  <div className="relative">
                    <Input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      min="1"
                      step="1"
                      required
                      className="h-11 rounded-xl pr-14 bg-muted/40 font-bold text-base"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none">
                      {currency}
                    </div>
                  </div>
                </div>
              </div>

              {/* Supporting Document Upload (Mandatory) */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider">
                    Supporting Document (Receipt / Voucher / Invoice) *
                  </Label>
                  <Badge variant="outline" className="text-[9px] font-bold text-primary">Required</Badge>
                </div>

                {!receiptFile && !receiptUrl ? (
                  <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-muted/20 hover:bg-muted/40 transition-colors">
                    <input
                      id="expense-receipt-input"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="hidden"
                      onChange={handleReceiptSelect}
                    />
                    <label htmlFor="expense-receipt-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                      <UploadCloud className="h-8 w-8 text-primary" />
                      <span className="text-xs font-bold text-foreground">Click to upload or drag &amp; drop receipt</span>
                      <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOCX (Max 10MB)</span>
                    </label>
                  </div>
                ) : (
                  <div className="p-3 bg-muted/50 rounded-xl border border-border flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate text-foreground">
                          {receiptFile?.name || receiptFileName}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {receiptFile && <span>{(receiptFile.size / 1024).toFixed(1)} KB</span>}
                          {isUploadingFile ? (
                            <span className="text-primary font-bold flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                            </span>
                          ) : (
                            <span className="text-green-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Attached
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {receiptUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 text-xs font-bold text-primary"
                        >
                          <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" /> View
                          </a>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveReceipt}
                        className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Justification / Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">Operational Justification</Label>
                <Textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain why this expense was incurred, vendor reference, check/transaction ID, etc."
                  rows={3}
                  className="rounded-xl bg-muted/40 text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 bg-muted/30 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsLodgeOpen(false)}
                className="rounded-xl font-bold h-11 px-4 w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isUploadingFile || !amount || Number(amount) <= 0 || (!receiptUrl && !receiptFile)}
                className="rounded-xl font-bold h-11 px-6 bg-primary text-primary-foreground shadow-lg w-full sm:w-auto gap-2"
              >
                {isSubmitting || isUploadingFile ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lodging Expense...
                  </>
                ) : (
                  <>
                    <Receipt className="h-4 w-4" />
                    Submit for Admin Approval
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: REVIEW & APPROVE (Administrator Only) */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl rounded-2xl bg-card border shadow-2xl p-0 overflow-hidden">
          {selectedExpense && (
            <div className="flex flex-col">
              <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 bg-muted/30 border-b">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-widest">
                    Executive Review
                  </Badge>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    ID: {selectedExpense.id.slice(0, 8)}
                  </Badge>
                </div>
                <DialogTitle className="text-lg sm:text-xl font-bold font-headline">Audit &amp; Authorize Expense</DialogTitle>
                <DialogDescription className="text-xs">
                  Review supporting documentation. Approving will subtract this sum from total institutional assets.
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Metric Summary */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-muted border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Disbursement Amount
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-foreground font-headline mt-0.5 break-all">
                      -{formatCurrency(selectedExpense.amount, currency)}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-semibold text-xs border-border text-foreground self-start sm:self-auto shrink-0 max-w-full truncate">
                    {selectedExpense.category}
                  </Badge>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/30 p-3.5 rounded-xl border border-border">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Title / Payee</span>
                    <p className="font-bold text-foreground mt-0.5 break-words">{selectedExpense.title}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Expense Date</span>
                    <p className="font-bold text-foreground mt-0.5">{selectedExpense.expenseDate}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Lodged By</span>
                    <p className="font-semibold text-foreground mt-0.5 break-words">{selectedExpense.lodgedByName || 'Accountant'}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Accountant Email</span>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5 break-all">{selectedExpense.lodgedByEmail || '—'}</p>
                  </div>
                </div>

                {/* Stated Justification */}
                {selectedExpense.description && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Operational Justification
                    </Label>
                    <div className="p-3 bg-muted/40 rounded-xl text-xs text-foreground italic border border-border/50 break-words whitespace-pre-wrap">
                      &ldquo;{selectedExpense.description}&rdquo;
                    </div>
                  </div>
                )}

                {/* Supporting Document View Card */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Supporting Document (Proof)
                  </Label>
                  {selectedExpense.receiptUrl ? (
                    <div className="p-3 bg-background rounded-xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <span className="text-xs font-bold truncate text-foreground min-w-0">
                          {selectedExpense.receiptFileName || 'Supporting_Receipt.pdf'}
                        </span>
                      </div>
                      <Button asChild size="sm" className="h-8 rounded-lg font-bold text-xs gap-1.5 shrink-0 w-full sm:w-auto justify-center">
                        <a href={selectedExpense.receiptUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" /> Inspect Document
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive font-medium">⚠️ No supporting document attached.</p>
                  )}
                </div>

                {/* Note Field & Stage Instructions */}
                {selectedExpense.status === 'pending_approval' ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider">
                      Administrator Approval Notes (Optional)
                    </Label>
                    <Input 
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="e.g., Verified against physical invoice, approved for debit..."
                      className="h-10 rounded-xl bg-muted/40 text-xs w-full"
                      disabled={!canApprove}
                    />
                  </div>
                ) : isSeniorAcct ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider">
                      Senior Accountant Initial Review Notes (Optional)
                    </Label>
                    <Input 
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="e.g., Cross-referenced with vendor receipt, figures verified..."
                      className="h-10 rounded-xl bg-muted/40 text-xs w-full"
                    />
                  </div>
                ) : selectedExpense.lodgedBy === user?.uid ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 text-xs font-semibold">
                    Dual-Control Guardrail: You lodged this expense and cannot self-review. A separate reviewer must endorse it.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider">
                      Reviewer Endorsement Notes (Optional)
                    </Label>
                    <Input 
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="e.g., Compliance verification completed..."
                      className="h-10 rounded-xl bg-muted/40 text-xs w-full"
                      disabled={!canReview}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="p-4 sm:p-6 pt-3 sm:pt-4 bg-muted/30 border-t flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {selectedExpense.status === 'pending_approval' ? (
                  canApprove ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsRejectOpen(true)}
                        className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 order-2 md:order-1 w-full md:w-auto shrink-0"
                      >
                        <Ban className="mr-2 h-4 w-4" /> Reject Expense
                      </Button>

                      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 order-1 md:order-2 w-full md:w-auto">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setIsReviewOpen(false)}
                          className="rounded-xl font-bold h-11 px-4 w-full sm:w-auto"
                        >
                          Close
                        </Button>
                        <Button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleApprove}
                          className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg h-11 px-5 w-full sm:w-auto gap-2 shrink-0 justify-center whitespace-nowrap"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Authorize &amp; Deduct from Assets
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs text-muted-foreground font-medium">Stage 3: Endorsed by Compliance Reviewer. Awaiting Administrator sign-off.</p>
                      <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-10 px-4">
                        Close
                      </Button>
                    </div>
                  )
                ) : selectedExpense.status === 'pending_reviewer' ? (
                  isComplianceReviewer ? (
                    selectedExpense.lodgedBy === user?.uid ? (
                      <div className="flex items-center justify-between w-full">
                        <p className="text-xs text-muted-foreground font-medium">You lodged this expense. Another compliance reviewer must review it.</p>
                        <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-10 px-4">
                          Close
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleReview('reject')}
                          disabled={isSubmitting}
                          className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 order-2 md:order-1 w-full md:w-auto shrink-0"
                        >
                          <Ban className="mr-2 h-4 w-4" /> Reject
                        </Button>

                        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 order-1 md:order-2 w-full md:w-auto">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsReviewOpen(false)}
                            className="rounded-xl font-bold h-11 px-4 w-full sm:w-auto"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSubmitting}
                            onClick={() => handleReview('request_changes')}
                            className="rounded-xl font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 h-11 px-4"
                          >
                            Request Changes
                          </Button>
                          <Button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleReview('endorse')}
                            className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg h-11 px-5 w-full sm:w-auto gap-2 shrink-0 justify-center whitespace-nowrap"
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            Review
                          </Button>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs text-muted-foreground font-medium">Stage 2: Endorsed by Senior Accountant. Awaiting Compliance Reviewer.</p>
                      <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-10 px-4">
                        Close
                      </Button>
                    </div>
                  )
                ) : (
                  isSeniorAcct ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleReview('reject')}
                        disabled={isSubmitting}
                        className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 order-2 md:order-1 w-full md:w-auto shrink-0"
                      >
                        <Ban className="mr-2 h-4 w-4" /> Reject
                      </Button>

                      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 order-1 md:order-2 w-full md:w-auto">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setIsReviewOpen(false)}
                          className="rounded-xl font-bold h-11 px-4 w-full sm:w-auto"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => handleReview('request_changes')}
                          className="rounded-xl font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 h-11 px-4"
                        >
                          Request Changes
                        </Button>
                        <Button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview('endorse')}
                          className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg h-11 px-5 w-full sm:w-auto gap-2 shrink-0 justify-center whitespace-nowrap"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileCheck className="h-4 w-4" />
                          )}
                          Submit for Review
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs text-muted-foreground font-medium">Stage 1: Lodged. Awaiting Senior Accountant initial review.</p>
                      <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-10 px-4">
                        Close
                      </Button>
                    </div>
                  )
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: REJECT EXPENSE DIALOG */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md rounded-2xl bg-card border shadow-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Reject Operational Expense
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provide an official audit reason for turning down this expense request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Rejection Reason *</Label>
              <Textarea 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Unclear receipt proof, amount differs from invoice, missing committee pre-authorization..."
                rows={3}
                required
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsRejectOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isSubmitting || !rejectionReason.trim()}
              onClick={handleReject}
              className="rounded-xl font-bold text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md gap-1.5"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
