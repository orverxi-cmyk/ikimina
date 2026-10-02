'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  HandCoins, 
  ShieldCheck, 
  Info, 
  ArrowLeft,
  Lock,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Undo2,
  TrendingUp,
  RefreshCw,
  FileText,
  UploadCloud,
  X,
  ExternalLink,
  ShieldAlert,
  FileCheck
} from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from '@/firebase';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, doc, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { useSettings } from '@/context/settings-context';
import { requestLoanAction, withdrawLoanApplicationAction } from '@/lib/finance-client';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function LoanApplyContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTopUpRequested = searchParams?.get('topup') === 'true';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [isTopUpMode, setIsTopUpMode] = useState(isTopUpRequested);
  const [requestedAmount, setRequestedAmount] = useState<string>('');
  
  // Management approval exception state
  const [managementFile, setManagementFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [managementApprovalUrl, setManagementApprovalUrl] = useState<string>('');
  const [managementApprovalFileName, setManagementApprovalFileName] = useState<string>('');
  const [managementApprovalNotes, setManagementApprovalNotes] = useState<string>('');

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const { settings, loading: settingsLoading } = useSettings();
  const currency = settings.currency || 'RWF';
  const maxLoanAmount = settings.maxLoanAmount || 1000000;
  const minLoanAmount = settings.minLoanAmount || 5000;
  const maxLoanPercentage = Number(settings.maxLoanPercentage) || 200;

  // 1. Fetch user's loans to check for pending or active loans
  const loansQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid));
  }, [user]);

  const { data: loansSnap, loading: loansLoading } = useCollection(loansQuery);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [], [loansSnap]);

  // 2. Fetch user's contributions to calculate exact borrowing power
  const contributionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user]);

  const { data: contributionsSnap, loading: contributionsLoading } = useCollection(contributionsQuery);

  const totalVerifiedContributions = useMemo(() => {
    if (!contributionsSnap) return 0;
    return contributionsSnap.docs
      .map(d => d.data())
      .filter((c: any) => c.status === 'verified')
      .reduce((sum, c: any) => sum + (Number(c.amount) || 0), 0);
  }, [contributionsSnap]);

  const totalPendingContributions = useMemo(() => {
    if (!contributionsSnap) return 0;
    return contributionsSnap.docs
      .map(d => d.data())
      .filter((c: any) => c.status === 'pending')
      .reduce((sum, c: any) => sum + (Number(c.amount) || 0), 0);
  }, [contributionsSnap]);

  // 3. Fetch user's verified repayments to calculate repaid principal on active loans
  const repaymentsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'repayments'),
      where('memberId', '==', user.uid),
      where('status', '==', 'verified')
    );
  }, [user]);

  const { data: repaymentsSnap, loading: repaymentsLoading } = useCollection(repaymentsQuery);
  const verifiedRepayments = useMemo(() => repaymentsSnap?.docs.map(d => d.data()) || [], [repaymentsSnap]);

  // 4. Compute Borrowing Power: configured percentage (e.g. 200%) of verified contributions
  const borrowingPower = useMemo(() => {
    return Math.round((totalVerifiedContributions * maxLoanPercentage) / 100);
  }, [totalVerifiedContributions, maxLoanPercentage]);

  // 5. Effective Max Limit capped by system-wide maxLoanAmount
  const effectiveMaxLimit = useMemo(() => {
    return Math.min(borrowingPower, maxLoanAmount);
  }, [borrowingPower, maxLoanAmount]);

  // 6. Loan status guards
  const pendingLoan = useMemo(() => (loans.find((l: any) => l.status === 'requested') as any), [loans]);
  const activeLoan = useMemo(() => (loans.find((l: any) => l.status === 'approved' && (Number(l.balance) || 0) > 0) as any), [loans]);

  // 7. Calculate repaid principal on active loan
  const repaidPrincipal = useMemo(() => {
    if (!activeLoan) return 0;
    const loanRepaymentsTotal = verifiedRepayments
      .filter((r: any) => r.loanId === activeLoan.id)
      .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
    return Math.min(Number(activeLoan.amount) || 0, loanRepaymentsTotal);
  }, [activeLoan, verifiedRepayments]);

  // Effective Top-Up Cap: limited by repaid principal and borrowing power
  const maxTopUpLimit = useMemo(() => {
    return Math.min(repaidPrincipal, effectiveMaxLimit);
  }, [repaidPrincipal, effectiveMaxLimit]);

  const isEligibleForTopUp = Boolean(
    activeLoan && repaidPrincipal >= minLoanAmount && maxTopUpLimit >= minLoanAmount && !pendingLoan
  );

  // Auto-switch to top-up mode if requested via URL or active loan is present with repaid principal
  useEffect(() => {
    if (isTopUpRequested && isEligibleForTopUp) {
      setIsTopUpMode(true);
    }
  }, [isTopUpRequested, isEligibleForTopUp]);

  const hasSavings = totalVerifiedContributions > 0;
  const isBorrowingPowerEligible = effectiveMaxLimit >= minLoanAmount;

  // Determination of canApply based on standard mode vs top-up mode
  const canApply = useMemo(() => {
    if (pendingLoan) return false;
    if (isTopUpMode) {
      return Boolean(activeLoan && isEligibleForTopUp);
    }
    return !activeLoan;
  }, [pendingLoan, isTopUpMode, activeLoan, isEligibleForTopUp]);

  const effectiveApplicationMax = isTopUpMode ? maxTopUpLimit : effectiveMaxLimit;

  const minRequiredSavings = useMemo(() => {
    if (maxLoanPercentage <= 0) return 0;
    return Math.ceil(minLoanAmount / (maxLoanPercentage / 100));
  }, [minLoanAmount, maxLoanPercentage]);

  const numericAmount = Number(requestedAmount) || 0;
  const isAmountTooLow = numericAmount > 0 && numericAmount < minLoanAmount;
  // Exceeds standard borrowing power:
  const exceedsBorrowingPower = numericAmount > effectiveApplicationMax;
  // Exceeds absolute system-wide cap:
  const isAmountTooHigh = numericAmount > maxLoanAmount && maxLoanAmount > 0;
  const hasManagementApprovalAttached = Boolean(managementApprovalUrl || managementFile);

  // File Upload Handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setManagementFile(file);
    setManagementApprovalFileName(file.name);

    if (!user) return;
    setIsUploadingDoc(true);
    try {
      const storage = getStorage(initializeFirebase().app);
      const fileRef = ref(storage, `loan_management_approvals/${user.uid}/${Date.now()}_${file.name}`);
      const uploadResult = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(uploadResult.ref);
      setManagementApprovalUrl(url);
      toast({
        title: "Management Approval Attached",
        description: `${file.name} successfully uploaded and attached to application.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message || "Failed to upload approval document."
      });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleRemoveFile = () => {
    setManagementFile(null);
    setManagementApprovalUrl('');
    setManagementApprovalFileName('');
  };

  // Handle Loan Withdrawal
  const handleWithdrawApplication = async () => {
    if (!pendingLoan) return;
    setIsWithdrawing(true);
    try {
      await withdrawLoanApplicationAction({
        loanId: pendingLoan.id,
        reason: withdrawReason.trim() || 'Withdrawn by applicant'
      });
      toast({
        title: "Application Withdrawn",
        description: "Your pending loan application has been withdrawn. You may submit a new application whenever ready."
      });
      setIsWithdrawModalOpen(false);
      setWithdrawReason('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Withdrawal Failed",
        description: err.message || "Could not withdraw application."
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleApply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    if (pendingLoan) {
      toast({ 
        variant: "destructive", 
        title: "Pending Application", 
        description: "You already have a loan request awaiting management approval." 
      });
      return;
    }

    if (activeLoan && !isTopUpMode) {
      toast({ 
        variant: "destructive", 
        title: "Active Loan Outstanding", 
        description: `You must clear your active loan balance (${formatCurrency(activeLoan.balance, currency)}) before requesting a new loan, or choose Top-Up mode.` 
      });
      return;
    }

    if (isTopUpMode && !isEligibleForTopUp) {
      toast({
        variant: "destructive",
        title: "Top-Up Not Available",
        description: `You have repaid ${formatCurrency(repaidPrincipal, currency)}, which is below the minimum allowed loan (${formatCurrency(minLoanAmount, currency)}).`
      });
      return;
    }

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = (formData.get('description') as string)?.trim();

    if (isNaN(amount) || amount < minLoanAmount) {
      toast({ 
        variant: "destructive", 
        title: "Amount Too Low", 
        description: `Minimum allowed loan amount is ${formatCurrency(minLoanAmount, currency)}.` 
      });
      return;
    }

    if (amount > maxLoanAmount) {
      toast({ 
        variant: "destructive", 
        title: "System Ceiling Exceeded", 
        description: `Loan amount cannot exceed the maximum system limit of ${formatCurrency(maxLoanAmount, currency)}.` 
      });
      return;
    }

    const isExceeding = amount > effectiveApplicationMax;

    if (isExceeding && !managementApprovalUrl && !managementFile) {
      toast({ 
        variant: "destructive", 
        title: "Management Approval Required", 
        description: `Your requested loan of ${formatCurrency(amount, currency)} exceeds your borrowing power (${formatCurrency(effectiveApplicationMax, currency)}). You must attach official management approval to proceed.` 
      });
      return;
    }

    if (!isExceeding && !hasSavings) {
      toast({ 
        variant: "destructive", 
        title: "No Verified Savings", 
        description: "You must have verified savings contributions in the group, or attach management approval." 
      });
      return;
    }

    if (!isExceeding && !isBorrowingPowerEligible) {
      toast({ 
        variant: "destructive", 
        title: "Borrowing Power Too Low", 
        description: `Your borrowing limit (${formatCurrency(effectiveMaxLimit, currency)}) is below the minimum allowed loan (${formatCurrency(minLoanAmount, currency)}). Attach management approval to apply for this amount.` 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalApprovalUrl = managementApprovalUrl;
      if (isExceeding && !finalApprovalUrl && managementFile) {
        setIsUploadingDoc(true);
        const storage = getStorage(initializeFirebase().app);
        const fileRef = ref(storage, `loan_management_approvals/${user.uid}/${Date.now()}_${managementFile.name}`);
        const uploadResult = await uploadBytes(fileRef, managementFile);
        finalApprovalUrl = await getDownloadURL(uploadResult.ref);
        setManagementApprovalUrl(finalApprovalUrl);
        setIsUploadingDoc(false);
      }

      await requestLoanAction({
        amount,
        description: isTopUpMode 
          ? `[Top-Up on Loan #${activeLoan?.id?.slice(0, 8)}] ${description}` 
          : description,
        durationMonths: 12,
        isTopUp: isTopUpMode,
        parentLoanId: isTopUpMode && activeLoan ? activeLoan.id : undefined,
        exceedsBorrowingPower: isExceeding,
        managementApprovalUrl: isExceeding ? finalApprovalUrl : undefined,
        managementApprovalFileName: isExceeding ? (managementFile?.name || managementApprovalFileName || 'management_approval') : undefined,
        managementApprovalNotes: isExceeding ? managementApprovalNotes.trim() : undefined,
      });

      toast({ 
        title: isTopUpMode 
          ? "Top-Up Application Submitted" 
          : isExceeding 
            ? "Application Submitted with Management Approval" 
            : "Application Submitted", 
        description: "Your loan request has been sent to management for audit and approval." 
      });
      router.push('/loans');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Application Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
      setIsUploadingDoc(false);
    }
  };

  const isLoading = userDataLoading || loansLoading || contributionsLoading || repaymentsLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto pb-24">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-headline font-bold">
              {isTopUpMode ? "Apply for Loan Top-Up" : "Request Capital Loan"}
            </h1>
            {isTopUpMode && (
              <Badge className="bg-primary text-primary-foreground font-bold text-[10px] uppercase">
                Top-Up Mode
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isTopUpMode
              ? `Re-borrow up to your repaid principal (${formatCurrency(repaidPrincipal, currency)}) without clearing the full loan.`
              : "Submit a borrowing request based on your verified contribution standing"}
          </p>
        </div>
      </div>

      {/* Financial Standing Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Verified Contributions */}
        <div className="p-4 bg-card rounded-[10px] border border-border space-y-1 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Wallet className="h-3 w-3 text-green-600" /> My Verified Savings
          </p>
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(totalVerifiedContributions, currency)}
          </p>
          {totalPendingContributions > 0 && (
            <p className="text-[9px] font-bold text-orange-600">
              +{formatCurrency(totalPendingContributions, currency)} pending audit
            </p>
          )}
        </div>

        {/* Borrowing Power */}
        <div className="p-4 bg-primary/5 rounded-[10px] border border-primary/20 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-primary" /> Borrowing Power
            </p>
            <Badge variant="outline" className="text-[8px] font-bold px-1.5 py-0 border-primary/30 text-primary">
              {maxLoanPercentage}%
            </Badge>
          </div>
          <p className="text-lg font-bold text-primary">
            {formatCurrency(borrowingPower, currency)}
          </p>
          <p className="text-[9px] text-muted-foreground font-medium">
            {maxLoanPercentage}% of verified savings
          </p>
        </div>

        {/* Repaid Principal (if active loan) OR Minimum Loan */}
        {activeLoan ? (
          <div className="p-4 bg-green-500/5 rounded-[10px] border border-green-500/20 space-y-1 shadow-sm">
            <p className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-widest flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-600" /> Repaid Principal
            </p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">
              {formatCurrency(repaidPrincipal, currency)}
            </p>
            <p className="text-[9px] text-muted-foreground font-medium">
              Available to Top-Up
            </p>
          </div>
        ) : (
          <div className="p-4 bg-card rounded-[10px] border border-border space-y-1 shadow-sm">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <HandCoins className="h-3 w-3 text-blue-600" /> Minimum Loan
            </p>
            <p className="text-lg font-bold text-blue-600">
              {formatCurrency(minLoanAmount, currency)}
            </p>
            <p className="text-[9px] text-muted-foreground font-medium">
              Required minimum per request
            </p>
          </div>
        )}

        {/* Effective Max Ceiling */}
        <div className="p-4 bg-card rounded-[10px] border border-border space-y-1 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Lock className="h-3 w-3 text-orange-600" /> {isTopUpMode ? 'Top-Up Ceiling' : 'System Cap'}
          </p>
          <p className="text-lg font-bold text-orange-600">
            {formatCurrency(effectiveApplicationMax, currency)}
          </p>
          <p className="text-[9px] text-muted-foreground font-medium">
            {isTopUpMode ? 'Max top-up allowed' : 'Global maximum ceiling'}
          </p>
        </div>
      </div>

      {/* PENDING LOAN BANNER with WITHDRAW BUTTON */}
      {pendingLoan && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Pending Application Under Review</p>
              <p className="text-blue-800">
                You have a submitted loan request of <strong>{formatCurrency(pendingLoan.amount, currency)}</strong> currently awaiting management approval.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsWithdrawModalOpen(true)}
            className="rounded-xl border-blue-300 hover:bg-blue-100 text-blue-900 font-bold text-xs gap-1.5 shrink-0 self-start sm:self-center"
          >
            <Undo2 className="h-3.5 w-3.5" /> Withdraw Application
          </Button>
        </div>
      )}

      {/* TOP-UP OPPORTUNITY BANNER */}
      {activeLoan && isEligibleForTopUp && !pendingLoan && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-3">
            <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-emerald-900 dark:text-emerald-300">
                Loan Top-Up Available ({formatCurrency(repaidPrincipal, currency)} Repaid)
              </p>
              <p className="text-emerald-800 dark:text-emerald-400">
                You have repaid <strong>{formatCurrency(repaidPrincipal, currency)}</strong> on your active loan of {formatCurrency(activeLoan.amount, currency)}. You can top-up and borrow back the repaid principal without clearing the balance!
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setIsTopUpMode(!isTopUpMode)}
            className={isTopUpMode 
              ? "rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" 
              : "rounded-xl font-bold text-xs bg-primary text-primary-foreground shrink-0"}
          >
            {isTopUpMode ? "Switch to Standard View" : "Apply as Top-Up"}
          </Button>
        </div>
      )}

      {/* ACTIVE LOAN WARNING (when not eligible for top-up or top-up mode not active) */}
      {activeLoan && !isTopUpMode && (
        <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Active Loan Outstanding</p>
            <p className="text-orange-800">
              You currently have an active loan with an outstanding balance of <strong>{formatCurrency(activeLoan.balance, currency)}</strong>.
              {isEligibleForTopUp ? (
                <>
                  {' '}You are eligible for a <strong>Loan Top-Up</strong> of up to <strong>{formatCurrency(maxTopUpLimit, currency)}</strong>. Click the &ldquo;Apply as Top-Up&rdquo; button above to proceed.
                </>
              ) : (
                <>
                  {' '}You have repaid {formatCurrency(repaidPrincipal, currency)}. Top-up becomes available once repaid principal reaches the minimum loan amount of {formatCurrency(minLoanAmount, currency)}.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {!hasSavings && !pendingLoan && !activeLoan && (
        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-900 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">No Verified Savings Found</p>
            <p className="text-yellow-800">
              Your borrowing power is <strong>{maxLoanPercentage}% of your verified contributions</strong>. Currently, you have no verified savings recorded. Please deposit a monthly contribution to establish your borrowing quota.
            </p>
            <div className="pt-2">
              <Button asChild size="sm" variant="outline" className="h-8 text-xs font-bold border-yellow-300">
                <Link href="/contributions">Make a Contribution</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasSavings && !isBorrowingPowerEligible && !pendingLoan && !activeLoan && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Borrowing Power Below System Minimum</p>
            <p className="text-amber-800">
              Your verified contributions of <strong>{formatCurrency(totalVerifiedContributions, currency)}</strong> provide a borrowing power of <strong>{formatCurrency(borrowingPower, currency)} ({maxLoanPercentage}%)</strong>.
              However, the group policy sets the minimum allowed loan at <strong>{formatCurrency(minLoanAmount, currency)}</strong>.
            </p>
            <p className="text-amber-800 font-semibold pt-1">
              You need at least <strong>{formatCurrency(minRequiredSavings, currency)}</strong> in total verified contributions to qualify for the minimum loan.
            </p>
          </div>
        </div>
      )}

      {/* Main Loan Application Card */}
      <Card className="border border-border shadow-sm bg-card rounded-[10px] overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {isTopUpMode ? "Loan Top-Up Application" : "Loan Application"}
              </CardTitle>
            </div>
            {canApply && (
              <Badge className="bg-green-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
                {isTopUpMode ? "Eligible for Top-Up" : "Eligible to Borrow"}
              </Badge>
            )}
          </div>
          <CardDescription>
            {isTopUpMode
              ? `Top up your existing loan up to the repaid principal amount (${formatCurrency(maxTopUpLimit, currency)}).`
              : `Request a group capital loan up to your maximum borrowing power (${maxLoanPercentage}% of verified contributions).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleApply} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <Label htmlFor="loan-amount" className="text-xs font-bold uppercase tracking-wider">
                    {isTopUpMode ? "Top-Up Amount" : "Requested Amount"}
                  </Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-muted-foreground">
                      MIN: <strong className="text-foreground">{formatCurrency(minLoanAmount, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-[10px] font-bold text-primary">
                      POWER: <strong>{formatCurrency(effectiveApplicationMax, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                      MAX CEILING: <strong>{formatCurrency(maxLoanAmount, currency)}</strong>
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <Input 
                    id="loan-amount"
                    name="amount" 
                    type="number" 
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(e.target.value)}
                    placeholder={`Enter amount (${minLoanAmount} - ${maxLoanAmount})`}
                    min={canApply ? minLoanAmount : undefined}
                    max={canApply ? maxLoanAmount : undefined}
                    step="1"
                    disabled={!canApply || isSubmitting}
                    required 
                    className={`h-12 rounded-[10px] pr-14 bg-muted border-2 text-lg font-bold ${
                      isAmountTooHigh ? 'border-destructive focus-visible:ring-destructive' :
                      isAmountTooLow ? 'border-orange-500 focus-visible:ring-orange-500' :
                      exceedsBorrowingPower ? 'border-purple-500/70 focus-visible:ring-purple-500' :
                      numericAmount >= minLoanAmount && numericAmount <= effectiveApplicationMax ? 'border-green-500/50' : 'border-transparent'
                    }`} 
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none">
                    {currency}
                  </div>
                </div>

                {/* Quick Selection Buttons */}
                {canApply && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Quick Fill:</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRequestedAmount(minLoanAmount.toString())}
                      className="h-7 text-[11px] rounded-lg px-2.5 font-bold hover:border-primary/50"
                    >
                      Min: {formatCurrency(minLoanAmount, currency)}
                    </Button>
                    {effectiveApplicationMax > minLoanAmount && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRequestedAmount(effectiveApplicationMax.toString())}
                        className="h-7 text-[11px] rounded-lg px-2.5 font-bold hover:border-primary/50 text-primary border-primary/30"
                      >
                        Borrowing Power: {formatCurrency(effectiveApplicationMax, currency)}
                      </Button>
                    )}
                    {maxLoanAmount > effectiveApplicationMax && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRequestedAmount(maxLoanAmount.toString())}
                        className="h-7 text-[11px] rounded-lg px-2.5 font-bold hover:border-purple-500/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800"
                      >
                        Max Cap: {formatCurrency(maxLoanAmount, currency)} (Approval Req)
                      </Button>
                    )}
                  </div>
                )}

                {/* Validation helper messages */}
                {isAmountTooHigh && (
                  <p className="text-xs text-destructive font-bold flex items-center gap-1 pt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Amount exceeds the global maximum system limit of {formatCurrency(maxLoanAmount, currency)}.
                  </p>
                )}
                {isAmountTooLow && (
                  <p className="text-xs text-orange-600 font-bold flex items-center gap-1 pt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Amount is below the minimum allowed loan of {formatCurrency(minLoanAmount, currency)}.
                  </p>
                )}
                {exceedsBorrowingPower && !isAmountTooHigh && (
                  <p className="text-xs text-purple-700 dark:text-purple-300 font-bold flex items-center gap-1 pt-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Exceeds standard borrowing power ({formatCurrency(effectiveApplicationMax, currency)}). Management approval attachment is required.
                  </p>
                )}
              </div>

              {/* MANAGEMENT APPROVAL ATTACHMENT CARD */}
              {exceedsBorrowingPower && (
                <div className="p-4 rounded-xl bg-purple-500/10 border-2 border-purple-500/30 text-purple-950 dark:text-purple-100 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-sm">
                          Management Approval Attachment Required
                        </p>
                        <p className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                          Your requested loan of <strong>{formatCurrency(numericAmount, currency)}</strong> exceeds your calculated borrowing power of <strong>{formatCurrency(effectiveApplicationMax, currency)}</strong> by <strong>{formatCurrency(numericAmount - effectiveApplicationMax, currency)}</strong>.
                          Please attach an official signed management approval letter or resolution to validate this request.
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-purple-600 text-white font-bold text-[10px] uppercase shrink-0">
                      Quota Exception
                    </Badge>
                  </div>

                  {/* File Upload Area */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                      Upload Signed Approval Document (PDF / Image) *
                    </Label>
                    
                    {!managementFile && !managementApprovalUrl ? (
                      <div className="border-2 border-dashed border-purple-300 dark:border-purple-700/60 rounded-xl p-5 text-center bg-background/60 hover:bg-background transition-colors">
                        <input
                          id="management-approval-input"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                        <label htmlFor="management-approval-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                          <UploadCloud className="h-8 w-8 text-purple-600" />
                          <span className="text-xs font-bold text-foreground">Click to upload or drag &amp; drop approval file</span>
                          <span className="text-[10px] text-muted-foreground">Supported formats: PDF, JPG, PNG, DOCX (Max 10MB)</span>
                        </label>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-background rounded-xl border border-purple-300 dark:border-purple-700 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 shrink-0">
                            <FileCheck className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-foreground">
                              {managementFile?.name || managementApprovalFileName || 'Management_Approval_Document'}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {managementFile && (
                                <span>{(managementFile.size / 1024).toFixed(1)} KB</span>
                              )}
                              {isUploadingDoc ? (
                                <span className="text-primary font-bold flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                                </span>
                              ) : (
                                <span className="text-green-600 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Attached &amp; Ready
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {managementApprovalUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              asChild
                              className="h-8 text-xs font-bold text-purple-600 hover:text-purple-700"
                            >
                              <a href={managementApprovalUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                              </a>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Optional Reference Notes */}
                  <div className="space-y-1.5">
                    <Label htmlFor="management-approval-notes" className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                      Approval Reference / Minute Details (Optional)
                    </Label>
                    <Input
                      id="management-approval-notes"
                      value={managementApprovalNotes}
                      onChange={(e) => setManagementApprovalNotes(e.target.value)}
                      placeholder="e.g. Board Resolution #08/2026, authorized by Committee Chair"
                      className="h-10 rounded-xl bg-background border-purple-200 dark:border-purple-800 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="loan-description" className="text-xs font-bold uppercase tracking-wider">
                  {isTopUpMode ? "Top-Up Purpose & Justification" : "Purpose of Loan"}
                </Label>
                <Textarea 
                  id="loan-description"
                  name="description" 
                  placeholder={isTopUpMode 
                    ? "Explain the reason for this loan top-up and how repaid principal is being redeployed..." 
                    : "E.g., Small business expansion, inventory purchase, tuition fees, etc."} 
                  disabled={!canApply || isSubmitting}
                  required 
                  className="rounded-[10px] bg-muted border-none min-h-[110px] p-4 text-sm" 
                />
              </div>
            </div>

            <div className="bg-muted p-4 rounded-xl border border-border flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
                <p>
                  <strong>Terms & Governance:</strong> All capital loans are subject to audit and ratification by Management. Once approved, the authoritative repayment schedule is generated at the system policy rate (<strong>{settings.loanInterestRate}%</strong>, <strong>{settings.interestModel}</strong> model).
                </p>
                {isTopUpMode && (
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                    <strong>Top-Up Rule:</strong> This top-up is linked to parent loan #{activeLoan?.id?.slice(0, 8)}. Upon approval, the top-up loan will be disbursed and scheduled under standard group lending policy.
                  </p>
                )}
                {exceedsBorrowingPower && (
                  <p className="text-purple-700 dark:text-purple-400 font-medium">
                    <strong>Exception Policy:</strong> Applications exceeding standard borrowing power are routed to the Credit Committee with the attached management authorization for formal underwriting.
                  </p>
                )}
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={
                !canApply || 
                isSubmitting || 
                isUploadingDoc ||
                isAmountTooLow || 
                isAmountTooHigh || 
                numericAmount <= 0 ||
                (exceedsBorrowingPower && !hasManagementApprovalAttached)
              } 
              className="w-full h-14 rounded-[10px] font-bold shadow-lg text-lg transition-all"
            >
              {isSubmitting || isUploadingDoc ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  {isUploadingDoc ? "Uploading Approval Document..." : "Submitting Request..."}
                </>
              ) : pendingLoan ? (
                "Loan Request Pending Audit"
              ) : activeLoan && !isTopUpMode ? (
                "Active Loan Must Be Cleared (or Choose Top-Up)"
              ) : isAmountTooHigh ? (
                `Exceeds Maximum System Ceiling (${formatCurrency(maxLoanAmount, currency)})`
              ) : exceedsBorrowingPower && !hasManagementApprovalAttached ? (
                "Attach Management Approval to Submit"
              ) : exceedsBorrowingPower ? (
                <>
                  <ShieldCheck className="mr-2 h-5 w-5 text-purple-300" />
                  Submit with Management Approval ({formatCurrency(numericAmount, currency)})
                </>
              ) : isTopUpMode ? (
                <>
                  <TrendingUp className="mr-2 h-5 w-5" />
                  Submit Top-Up Request ({formatCurrency(numericAmount || minLoanAmount, currency)})
                </>
              ) : (
                <>
                  <HandCoins className="mr-2 h-5 w-5" />
                  Submit Loan Request ({formatCurrency(numericAmount || minLoanAmount, currency)})
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* WITHDRAW LOAN CONFIRMATION MODAL */}
      <Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-destructive" />
              Withdraw Loan Application
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw your pending loan request for {pendingLoan ? formatCurrency(pendingLoan.amount, currency) : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                Withdrawal Reason (Optional)
              </Label>
              <Textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="e.g. Changed financial plans, re-submitting with different amount..."
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsWithdrawModalOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isWithdrawing}
              onClick={handleWithdrawApplication}
              className="rounded-xl font-bold text-xs gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md"
            >
              {isWithdrawing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Confirm Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LoanApplyPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoanApplyContent />
    </Suspense>
  );
}

