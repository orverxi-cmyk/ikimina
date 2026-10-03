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
  FileCheck,
  Landmark,
  AlertOctagon
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
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import { requestLoanAction, withdrawLoanApplicationAction, getGroupLiquidityMetricsAction } from '@/lib/finance-client';
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
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  
  // Management approval exception state
  const [managementFile, setManagementFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [managementApprovalUrl, setManagementApprovalUrl] = useState<string>('');
  const [managementApprovalFileName, setManagementApprovalFileName] = useState<string>('');
  const [managementApprovalNotes, setManagementApprovalNotes] = useState<string>('');
  
  // Institutional Liquidity & Lending Pool Ceiling State
  const [liquidityMetrics, setLiquidityMetrics] = useState<any>(null);
  const [loadingLiquidity, setLoadingLiquidity] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      setLoadingLiquidity(true);
      try {
        const metrics = await getGroupLiquidityMetricsAction();
        if (isMounted) setLiquidityMetrics(metrics);
      } catch (e) {
        console.warn('Could not fetch liquidity metrics', e);
      } finally {
        if (isMounted) setLoadingLiquidity(false);
      }
    }
    loadMetrics();
    return () => { isMounted = false; };
  }, []);

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const { settings, loading: settingsLoading } = useSettings();
  const currency = settings.currency || 'RWF';
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

  // 5. Effective Max Limit determined by borrowing power
  const effectiveMaxLimit = useMemo(() => {
    return borrowingPower;
  }, [borrowingPower]);

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

  // Lending Pool Ceiling Validation
  const isLendingPoolCeiled = Boolean(liquidityMetrics && liquidityMetrics.availableLendingPool <= 0);
  const availableGroupPool = liquidityMetrics ? Number(liquidityMetrics.availableLendingPool) : null;

  // Determination of canApply based on standard mode vs top-up mode + pool ceiling
  const canApply = useMemo(() => {
    if (isLendingPoolCeiled) return false;
    if (pendingLoan) return false;
    if (isTopUpMode) {
      return Boolean(activeLoan && isEligibleForTopUp);
    }
    return !activeLoan;
  }, [isLendingPoolCeiled, pendingLoan, isTopUpMode, activeLoan, isEligibleForTopUp]);

  // Dynamic screen resolution: Only display the application form if no hard blockers exist
  const shouldShowForm = useMemo(() => {
    if (isLendingPoolCeiled) return false;
    if (pendingLoan) return false;
    if (activeLoan && !isTopUpMode) return false;
    if (!hasSavings && !isTopUpMode && !showExceptionForm) return false;
    if (hasSavings && !isBorrowingPowerEligible && !isTopUpMode && !showExceptionForm) return false;
    return true;
  }, [isLendingPoolCeiled, pendingLoan, activeLoan, isTopUpMode, hasSavings, isBorrowingPowerEligible, showExceptionForm]);

  const effectiveApplicationMax = isTopUpMode ? maxTopUpLimit : effectiveMaxLimit;

  const minRequiredSavings = useMemo(() => {
    if (maxLoanPercentage <= 0) return 0;
    return Math.ceil(minLoanAmount / (maxLoanPercentage / 100));
  }, [minLoanAmount, maxLoanPercentage]);

  const numericAmount = Number(requestedAmount) || 0;
  const isAmountTooLow = numericAmount > 0 && numericAmount < minLoanAmount;
  // Exceeds standard borrowing power:
  const exceedsBorrowingPower = numericAmount > effectiveApplicationMax;
  // Exceeds available lending pool ceiling:
  const exceedsGroupPool = Boolean(availableGroupPool !== null && numericAmount > availableGroupPool);
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
    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before withdrawing loan application.",
      });
    }

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
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Withdrawal Failed",
        description: parsed.message
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleApply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "Your device is currently offline. Please check your internet connection before submitting a loan application.",
      });
      return;
    }

    if (isLendingPoolCeiled) {
      toast({
        variant: "destructive",
        title: "No Funds Available to Loan From",
        description: `The lending pool ceiling (${liquidityMetrics?.maxLendingPoolPercentage || 90}%) has been reached. Current available pool is ${formatCurrency(0, currency)}.`,
      });
      return;
    }

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


    if (availableGroupPool !== null && amount > availableGroupPool) {
      toast({ 
        variant: "destructive", 
        title: "Insufficient Available Liquidity", 
        description: `Requested loan of ${formatCurrency(amount, currency)} exceeds the available lending pool of ${formatCurrency(availableGroupPool, currency)} (based on the ${liquidityMetrics?.maxLendingPoolPercentage || 90}% ceiling of institutional assets).` 
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
        description: "You must have verified savings contributions recorded, or attach management approval." 
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
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Application Failed", description: parsed.message });
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
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-3xl mx-auto pb-24">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full shrink-0">
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[13px] font-bold font-headline text-foreground">
              {isTopUpMode ? "Apply for Loan Top-Up" : "Request Capital Loan"}
            </h1>
            {isTopUpMode && (
              <Badge className="bg-primary text-primary-foreground font-bold text-[9px] uppercase">
                Top-Up Mode
              </Badge>
            )}
          </div>
          <p className="text-[12px] font-bold text-muted-foreground">
            {isTopUpMode
              ? `Re-borrow up to your repaid principal (${formatCurrency(repaidPrincipal, currency)}) without clearing the full loan.`
              : "Submit a borrowing request based on your verified contribution standing"}
          </p>
        </div>
      </div>

      {/* Financial Standing Cards Grid - 3 cards without redundant System Cap */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Verified Contributions */}
        <div className="p-4 bg-card rounded-[10px] border border-border space-y-1 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Wallet className="h-3 w-3 text-green-600" /> My Verified Savings
          </p>
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(totalVerifiedContributions, currency)}
          </p>
          {totalPendingContributions > 0 && (
            <p className="text-[9px] font-bold text-muted-foreground">
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
      </div>

      {/* DYNAMIC CASE 1: LENDING POOL CEILING REACHED (DEPLETED) */}
      {isLendingPoolCeiled && (
        <Card className="border border-blue-200 dark:border-blue-900/50 shadow-sm bg-card rounded-[10px] overflow-hidden animate-in fade-in">
          <CardHeader className="bg-blue-600 text-white p-5 border-b border-blue-700/30">
            <div className="flex items-center gap-3 text-white">
              <AlertCircle className="h-6 w-6 shrink-0 text-white" />
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-white">
                  No Funds Available to Loan From
                </CardTitle>
                <CardDescription className="text-blue-100 text-xs mt-0.5">
                  The institutional lending pool capacity has reached its statutory ceiling.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">
              The lending pool ceiling of <strong>{liquidityMetrics?.maxLendingPoolPercentage || 90}%</strong> of total net assets has been fully utilized. Active loans have reached <strong>{formatCurrency(liquidityMetrics?.currentActiveLoanBalance || 0, currency)}</strong> out of the <strong>{formatCurrency(liquidityMetrics?.maxLendingPool || 0, currency)}</strong> maximum capacity (Total Assets: {formatCurrency(liquidityMetrics?.netTotalAssets || 0, currency)}).
            </p>
            <p className="text-xs text-muted-foreground font-medium">
              New loan applications are temporarily paused until members make loan repayments or institutional assets expand. The application form is currently disabled to prevent failed requests.
            </p>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button asChild className="rounded-[10px] font-bold text-xs">
                <Link href="/contributions">Make a Contribution</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-[10px] font-bold text-xs">
                <Link href="/loans">View Loan Records</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DYNAMIC CASE 2: PENDING LOAN UNDER REVIEW */}
      {!isLendingPoolCeiled && pendingLoan && (
        <Card className="border border-blue-200 bg-blue-50/50 shadow-sm rounded-[10px] overflow-hidden animate-in fade-in">
          <CardHeader className="bg-blue-100/50 border-b border-blue-200 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-blue-900">
                <AlertCircle className="h-5 w-5 text-blue-600 shrink-0" />
                <CardTitle className="text-base sm:text-lg font-bold">
                  Loan Application Under Review
                </CardTitle>
              </div>
              <Badge className="bg-blue-600 text-white font-bold text-[10px] uppercase">
                Pending Audit
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-blue-900 leading-relaxed">
              You currently have a submitted loan request of <strong>{formatCurrency(pendingLoan.amount, currency)}</strong> undergoing management audit. Only one pending application is permitted at a time.
            </p>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWithdrawModalOpen(true)}
                className="rounded-[10px] border-blue-300 hover:bg-blue-100 text-blue-900 font-bold text-xs gap-1.5"
              >
                <Undo2 className="h-3.5 w-3.5" /> Withdraw Application
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-blue-900 font-bold text-xs">
                <Link href="/loans">Back to Loans Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DYNAMIC CASE 3: ACTIVE LOAN OUTSTANDING (NOT IN TOP-UP MODE) */}
      {!isLendingPoolCeiled && !pendingLoan && activeLoan && !isTopUpMode && (
        <Card className="border border-border bg-card shadow-sm rounded-[10px] overflow-hidden animate-in fade-in">
          <CardHeader className="bg-muted/40 border-b border-border pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <CardTitle className="text-base sm:text-lg font-bold">
                  Active Loan Outstanding
                </CardTitle>
              </div>
              <Badge variant="outline" className="font-bold text-[10px] uppercase">
                Active Loan: {formatCurrency(activeLoan.balance, currency)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              You currently have an active loan with an outstanding balance of <strong className="text-foreground">{formatCurrency(activeLoan.balance, currency)}</strong>.
              {isEligibleForTopUp ? (
                <> You have repaid <strong className="text-foreground">{formatCurrency(repaidPrincipal, currency)}</strong> and are eligible to apply for a <strong className="text-foreground">Loan Top-Up</strong> without clearing the entire loan.</>
              ) : (
                <> System policy allows one active loan at a time. You have repaid {formatCurrency(repaidPrincipal, currency)}. Once your repaid principal reaches the minimum loan amount of {formatCurrency(minLoanAmount, currency)}, you will be eligible for a Top-Up.</>
              )}
            </p>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              {isEligibleForTopUp && (
                <Button
                  onClick={() => setIsTopUpMode(true)}
                  className="rounded-[10px] font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <TrendingUp className="h-4 w-4" /> Apply as Top-Up ({formatCurrency(maxTopUpLimit, currency)} max)
                </Button>
              )}
              <Button asChild variant="outline" className="rounded-[10px] font-bold text-xs">
                <Link href="/loans">View Active Loan Schedule</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DYNAMIC CASE 4: NO VERIFIED SAVINGS FOUND */}
      {!isLendingPoolCeiled && !pendingLoan && !activeLoan && !hasSavings && !showExceptionForm && (
        <Card className="border border-border bg-card shadow-sm rounded-[10px] overflow-hidden animate-in fade-in">
          <CardHeader className="bg-muted/30 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary shrink-0" />
              <CardTitle className="text-base sm:text-lg font-bold">
                No Verified Savings Found
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your borrowing power is <strong className="text-foreground">{maxLoanPercentage}% of your verified contributions</strong>. Currently, you have no verified savings recorded. Please deposit a monthly contribution to establish your borrowing quota.
            </p>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button asChild className="rounded-[10px] font-bold text-xs">
                <Link href="/contributions">Make a Contribution</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowExceptionForm(true)}
                className="rounded-[10px] font-bold text-xs"
              >
                Apply with Management Approval
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DYNAMIC CASE 5: BORROWING POWER BELOW MINIMUM */}
      {!isLendingPoolCeiled && !pendingLoan && !activeLoan && hasSavings && !isBorrowingPowerEligible && !showExceptionForm && (
        <Card className="border border-border bg-card shadow-sm rounded-[10px] overflow-hidden animate-in fade-in">
          <CardHeader className="bg-muted/30 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <CardTitle className="text-base sm:text-lg font-bold">
                Borrowing Power Below System Minimum
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your verified contributions of <strong className="text-foreground">{formatCurrency(totalVerifiedContributions, currency)}</strong> provide a borrowing power of <strong className="text-foreground">{formatCurrency(borrowingPower, currency)} ({maxLoanPercentage}%)</strong>.
              However, system policy sets the minimum allowed loan at <strong className="text-foreground">{formatCurrency(minLoanAmount, currency)}</strong>.
              You need at least <strong className="text-foreground">{formatCurrency(minRequiredSavings, currency)}</strong> in verified savings to meet the standard threshold.
            </p>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button asChild className="rounded-[10px] font-bold text-xs">
                <Link href="/contributions">Deposit Savings</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowExceptionForm(true)}
                className="rounded-[10px] font-bold text-xs"
              >
                Apply with Management Approval
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LENDING POOL AVAILABILITY STRIP (WHEN FORM IS ELIGIBLE TO BE SHOWN) */}
      {shouldShowForm && liquidityMetrics && !isLendingPoolCeiled && (
        <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                Lending Pool Availability: <span className="text-primary font-headline text-sm font-bold">{formatCurrency(liquidityMetrics.availableLendingPool, currency)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ceiling: {liquidityMetrics.maxLendingPoolPercentage}% of total assets ({formatCurrency(liquidityMetrics.maxLendingPool, currency)} cap | {formatCurrency(liquidityMetrics.currentActiveLoanBalance, currency)} active)
              </p>
            </div>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold self-start sm:self-auto">
            Liquidity Available
          </Badge>
        </div>
      )}

      {/* EXCEPTION NOTICE BANNER (WHEN UNLOCKED WITH ZERO SAVINGS OR LOW POWER) */}
      {shouldShowForm && showExceptionForm && (!hasSavings || !isBorrowingPowerEligible) && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Management Exception Mode:</strong> You are submitting a loan request requiring official leadership authorization. Please ensure you attach the approval document below.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExceptionForm(false)}
            className="h-7 text-[11px] font-bold px-2 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 shrink-0"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Main Loan Application Card - DYNAMICALLY RENDERED ONLY WHEN ELIGIBLE */}
      {shouldShowForm && (
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
              : `Request a capital loan up to your maximum borrowing power (${maxLoanPercentage}% of verified contributions).`}
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
                      BORROWING POWER: <strong>{formatCurrency(effectiveApplicationMax, currency)}</strong>
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
                    placeholder={`Enter amount (min. ${formatCurrency(minLoanAmount, currency)})`}
                    min={canApply ? minLoanAmount : undefined}
                    step="1"
                    disabled={!canApply || isSubmitting}
                    required 
                    className={`h-12 rounded-[10px] pr-14 bg-muted border-2 text-lg font-bold ${
                      isAmountTooLow ? 'border-border focus-visible:ring-border' :
                      exceedsBorrowingPower ? 'border-primary focus-visible:ring-primary' :
                      numericAmount >= minLoanAmount && numericAmount <= effectiveApplicationMax ? 'border-green-600/50' : 'border-transparent'
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
                  </div>
                )}

                {/* Deposit bank details displayed below amount */}
                {(settings.depositBankName || settings.depositAccountNumber) && (
                  <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-1.5 text-primary min-w-0">
                      <Landmark className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium text-[11px] text-muted-foreground">Deposit Bank:</span>
                      <strong className="text-foreground truncate">{settings.depositBankName || 'Designated Bank'}</strong>
                    </div>
                    {settings.depositAccountNumber && (
                      <div className="font-mono font-bold text-xs text-foreground bg-background px-2 py-0.5 rounded border border-border shrink-0">
                        {settings.depositAccountNumber}
                      </div>
                    )}
                  </div>
                )}

                {/* Upfront interest calculation preview */}
                {numericAmount >= minLoanAmount && (() => {
                  const rate = settings.loanInterestRate || 10;
                  const interestAmt = Math.round(numericAmount * (rate / 100));
                  const netReceived = Math.max(0, numericAmount - interestAmt);
                  const monthlyEst = Math.round(numericAmount / 12);

                  return (
                    <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Upfront Interest Calculation
                        </span>
                        <Badge className="bg-emerald-600 text-white font-bold text-[8px] uppercase">
                          Interest Deducted at Source
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 bg-background rounded-lg border border-border">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Approved Loan</p>
                          <p className="font-bold text-foreground mt-0.5">{formatCurrency(numericAmount, currency)}</p>
                        </div>
                        <div className="p-2 bg-background rounded-lg border border-border">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Interest ({rate}%)</p>
                          <p className="font-bold text-foreground mt-0.5">-{formatCurrency(interestAmt, currency)}</p>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Amount Received</p>
                          <p className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{formatCurrency(netReceived, currency)}</p>
                        </div>
                        <div className="p-2 bg-background rounded-lg border border-border">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Repayable</p>
                          <p className="font-bold text-primary mt-0.5">{formatCurrency(numericAmount, currency)}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">({formatCurrency(monthlyEst, currency)}/mo)</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        * The {rate}% interest is deducted from the approved loan at disbursement. You receive {formatCurrency(netReceived, currency)}, and your 12-month payment schedule will repay the total amount of {formatCurrency(numericAmount, currency)}.
                      </p>
                    </div>
                  );
                })()}

                {/* Validation helper messages */}
                {exceedsGroupPool && (
                  <p className="text-xs text-destructive font-bold flex items-center gap-1 pt-1">
                    <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                    Amount exceeds the available lending pool of {formatCurrency(availableGroupPool || 0, currency)}. Please apply for {formatCurrency(availableGroupPool || 0, currency)} or less.
                  </p>
                )}
                {isAmountTooLow && (
                  <p className="text-xs text-foreground font-bold flex items-center gap-1 pt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Amount is below the minimum allowed loan of {formatCurrency(minLoanAmount, currency)}.
                  </p>
                )}
                {exceedsBorrowingPower && !exceedsGroupPool && (
                  <p className="text-xs text-primary font-bold flex items-center gap-1 pt-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Exceeds standard borrowing power ({formatCurrency(effectiveApplicationMax, currency)}). Management approval attachment is required.
                  </p>
                )}
              </div>

              {/* MANAGEMENT APPROVAL ATTACHMENT CARD */}
              {exceedsBorrowingPower && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-foreground space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-sm">
                          Management Approval Attachment Required
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Your requested loan of <strong>{formatCurrency(numericAmount, currency)}</strong> exceeds your calculated borrowing power of <strong>{formatCurrency(effectiveApplicationMax, currency)}</strong> by <strong>{formatCurrency(numericAmount - effectiveApplicationMax, currency)}</strong>.
                          Please attach an official signed management approval letter or resolution to validate this request.
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-primary text-primary-foreground font-bold text-[10px] uppercase shrink-0">
                      Quota Exception
                    </Badge>
                  </div>

                  {/* File Upload Area */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Upload Signed Approval Document (PDF / Image) *
                    </Label>
                    
                    {!managementFile && !managementApprovalUrl ? (
                      <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-background/60 hover:bg-background transition-colors">
                        <input
                          id="management-approval-input"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                        <label htmlFor="management-approval-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                          <UploadCloud className="h-8 w-8 text-primary" />
                          <span className="text-xs font-bold text-foreground">Click to upload or drag &amp; drop approval file</span>
                          <span className="text-[10px] text-muted-foreground">Supported formats: PDF, JPG, PNG, DOCX (Max 10MB)</span>
                        </label>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-background rounded-xl border border-border flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
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
                              className="h-8 text-xs font-bold text-primary hover:text-primary/80"
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
                            className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Optional Reference Notes */}
                  <div className="space-y-1.5">
                    <Label htmlFor="management-approval-notes" className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Approval Reference / Minute Details (Optional)
                    </Label>
                    <Input
                      id="management-approval-notes"
                      value={managementApprovalNotes}
                      onChange={(e) => setManagementApprovalNotes(e.target.value)}
                      placeholder="e.g. Board Resolution #08/2026, authorized by Committee Chair"
                      className="h-10 rounded-xl bg-background border-border text-xs"
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
                    <strong>Top-Up Rule:</strong> This top-up is linked to parent loan #{activeLoan?.id?.slice(0, 8)}. Upon approval, the top-up loan will be disbursed and scheduled under standard lending policy.
                  </p>
                )}
                {exceedsBorrowingPower && (
                  <p className="text-primary font-medium">
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
                exceedsGroupPool ||
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
              ) : exceedsGroupPool ? (
                `Exceeds Available Pool (${formatCurrency(availableGroupPool || 0, currency)})`
              ) : exceedsBorrowingPower && !hasManagementApprovalAttached ? (
                "Attach Management Approval to Submit"
              ) : exceedsBorrowingPower ? (
                <>
                  <ShieldCheck className="mr-2 h-5 w-5 text-white" />
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
      )}

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

