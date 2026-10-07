
'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Loader2, 
  CreditCard, 
  History as HistoryIcon, 
  HandCoins, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Eye, 
  Calendar,
  Landmark,
  ShieldCheck,
  Ban,
  Lock,
  ChevronRight,
  User as UserIcon,
  Undo2,
  Sparkles,
  ShieldAlert,
  FileText,
  ExternalLink,
  AlertOctagon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, doc, orderBy, where, Timestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isPast } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  recordRepaymentAction, 
  verifyRepaymentAction, 
  approveLoanAction, 
  rejectLoanAction,
  withdrawLoanApplicationAction,
  getGroupLiquidityMetricsAction 
} from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import { formatCurrency } from '@/lib/currency';
import { parseSafeDate, safeFormatDate } from '@/lib/loan-utils';
import Link from 'next/link';
import { useSettings } from '@/context/settings-context';

function LoansPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const { settings } = useSettings();
  const currency = settings.currency;
  const globalRate = settings.loanInterestRate || 10;
  const globalPenaltyRate = settings.penaltyRate || 2;
  const globalInterestType = settings.interestType || 'immediate';
  const minLoanAmount = settings.minLoanAmount || 5000;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isVerifyRepayOpen, setIsVerifyRepayOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isViewScheduleOpen, setIsViewScheduleOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [loanToWithdraw, setLoanToWithdraw] = useState<any>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('schedule');

  // Institutional Liquidity & Lending Pool Ceiling State
  const [liquidityMetrics, setLiquidityMetrics] = useState<any>(null);
  const [loadingLiquidity, setLoadingLiquidity] = useState(false);

  const loadLiquidityMetrics = async () => {
    setLoadingLiquidity(true);
    try {
      const metrics = await getGroupLiquidityMetricsAction();
      setLiquidityMetrics(metrics);
    } catch (e) {
      console.warn('Could not fetch liquidity metrics', e);
    } finally {
      setLoadingLiquidity(false);
    }
  };

  useEffect(() => {
    loadLiquidityMetrics();
  }, []);

  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const [cachedRole, setCachedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  const role = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');
  const isManagement = role === 'admin' || role === 'management' || role === 'accountant' || role === 'senior_accountant' || role === 'reviewer' || role === 'auditor';
  const isAuditor = role === 'auditor';
  const isSuperAdmin = role === 'admin' || isPrimaryAdmin;
  const isSeniorAccountant = role === 'senior_accountant';
  const isReviewer = role === 'reviewer' || role === 'management';
  
  const loansQuery = useMemoFirebase(() => {
    if (!user || userDataLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [user, isManagement, userDataLoading, userData]);

  const repaymentsQuery = useMemoFirebase(() => {
    if (!user || userDataLoading || !isManagement) return null;
    return query(collection(firestore, 'repayments'), where('status', '==', 'pending'), orderBy('date', 'desc'));
  }, [user, isManagement, userDataLoading]);

  const verifiedRepaymentsQuery = useMemoFirebase(() => {
    if (!user || userDataLoading) return null;
    if (isManagement) return query(collection(firestore, 'repayments'), where('status', '==', 'verified'));
    return query(collection(firestore, 'repayments'), where('memberId', '==', user.uid), where('status', '==', 'verified'));
  }, [user, isManagement, userDataLoading]);

  const membersQuery = useMemoFirebase(() => {
    if (!user || !isManagement) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [user, isManagement]);

  const contributionsQuery = useMemoFirebase(() => {
    if (!user || userDataLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'contributions'));
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user, isManagement, userDataLoading, userData]);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: repaymentsSnap } = useCollection(repaymentsQuery);
  const { data: verifiedRepaymentsSnap } = useCollection(verifiedRepaymentsQuery);
  const { data: membersSnap } = useCollection(membersQuery);
  const { data: contributionsSnap } = useCollection(contributionsQuery);

  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [], [loansSnap]);
  const pendingRepayments = useMemo(() => repaymentsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [repaymentsSnap]);
  const allVerifiedRepayments = useMemo(() => verifiedRepaymentsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [verifiedRepaymentsSnap]);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const allContributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);

  const maxLoanPercentage = Number(settings.maxLoanPercentage) || 200;

  const getMemberVerifiedContributions = (memberId: string) => {
    if (!memberId) return 0;
    return allContributions
      .filter((c: any) => c.memberId === memberId && c.status === 'verified')
      .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
  };

  const getMemberActiveDebt = (memberId: string) => {
    if (!memberId) return 0;
    return loans
      .filter((l: any) => l.memberId === memberId && l.status === 'approved')
      .reduce((sum: number, l: any) => sum + (Number(l.balance) || 0), 0);
  };

  const getMemberBorrowingPower = (memberId: string) => {
    const verified = getMemberVerifiedContributions(memberId);
    return Math.round((verified * maxLoanPercentage) / 100);
  };

  const getLoanRepaidPrincipal = (loanId: string, principalAmount: number) => {
    const list = allVerifiedRepayments.filter((r: any) => r.loanId === loanId);
    const totalRepaid = list.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
    return Math.min(principalAmount, totalRepaid);
  };

  const getMember = (id: string) => {
    if (id === user?.uid) return userData;
    return (members as any[]).find((m: any) => m.id === id);
  };

  const memberVerifiedSavings = useMemo(() => {
    return user ? getMemberVerifiedContributions(user.uid) : 0;
  }, [user, allContributions]);

  const memberBorrowingPower = useMemo(() => {
    return Math.round((memberVerifiedSavings * maxLoanPercentage) / 100);
  }, [memberVerifiedSavings, maxLoanPercentage]);

  const pendingRequests = useMemo(() => loans.filter((l: any) => l.status === 'requested'), [loans]);
  const myPending = useMemo(() => {
    if (!user) return null;
    return (loans.find((l: any) => l.memberId === user.uid && l.status === 'requested') as any) || null;
  }, [loans, user]);

  const myActive = useMemo(() => {
    if (!user) return null;
    return (loans.find((l: any) => l.memberId === user.uid && l.status === 'approved' && (Number(l.balance) || 0) > 0) as any) || null;
  }, [loans, user]);

  const myRepaid = useMemo(() => {
    if (!myActive) return 0;
    return getLoanRepaidPrincipal(myActive.id, myActive.amount);
  }, [myActive, allVerifiedRepayments]);

  const canTopUp = useMemo(() => {
    return Boolean(myActive && myRepaid >= minLoanAmount && !myPending);
  }, [myActive, myRepaid, minLoanAmount, myPending]);
  const activeLoans = useMemo(() => loans.filter((l: any) => l.status === 'approved'), [loans]);
  const historyLoans = useMemo(() => loans.filter((l: any) => ['approved', 'rejected', 'completed', 'requested', 'withdrawn'].includes(l.status)), [loans]);

  const handleWithdrawLoan = async () => {
    if (!loanToWithdraw) return;
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Network Connection Lost",
        description: "Cannot withdraw application while offline. Please verify your connection."
      });
      return;
    }
    setIsWithdrawing(true);
    try {
      await withdrawLoanApplicationAction({
        loanId: loanToWithdraw.id,
        reason: withdrawReason.trim() || 'Withdrawn by applicant'
      });
      toast({
        title: "Application Withdrawn",
        description: "Your loan application has been withdrawn. You can submit a new request anytime."
      });
      setIsWithdrawOpen(false);
      setLoanToWithdraw(null);
      setWithdrawReason('');
    } catch (error: any) {
      const appErr = parseAppError(error);
      toast({ variant: "destructive", title: appErr.title, description: appErr.message });
    } finally {
      setIsWithdrawing(false);
    }
  };
  
  const missedInstallments = useMemo(() => {
    const missed: any[] = [];
    loans.forEach((loan: any) => {
      if (loan.status === 'approved' && loan.amortization) {
        loan.amortization.forEach((inst: any) => {
          const dueDate = parseSafeDate(inst.dueDate);
          const target = Number(inst.amount) || 0;
          const paid = Number(inst.paidAmount) || (inst.status === 'paid' ? target : 0);
          const remaining = inst.remainingAmount !== undefined ? Number(inst.remainingAmount) : Math.max(0, target - paid);
          const isFullyPaid = inst.status === 'paid' || remaining <= 0;

          if (!isFullyPaid && dueDate && isPast(dueDate)) {
            missed.push({ 
              ...inst, 
              dueDate,
              amount: target,
              paidAmount: paid,
              remainingAmount: remaining,
              loanId: loan.id, 
              description: loan.description, 
              memberId: loan.memberId 
            });
          }
        });
      }
    });
    return missed;
  }, [loans]);

  const interestSummary = useMemo(() => {
    const gained = userData?.accruedInterest || 0;
    const paid = loans
      .filter((l: any) => l.status === 'approved' || l.status === 'completed')
      .reduce((acc, l: any) => acc + (l.interestAmount || 0), 0);
    return { gained, paid };
  }, [userData, loans]);

  const getMemberName = (id: string) => {
    if (id === user?.uid) return userData?.name || 'Me';
    return (members as any[]).find((m: any) => m.id === id)?.name || 'Unknown Member';
  };

  const handleRepay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !user) return;
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Network Connection Lost",
        description: "Unable to submit repayment while offline. Please check your internet connection."
      });
      return;
    }
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('repayAmount'));
    const proofFile = formData.get('proofFile') as File;
    const justification = formData.get('justification') as string;

    try {
      let proofUrl = '';
      if (proofFile && proofFile.size > 0) {
        const fileRef = ref(storage, `repayment_proofs/${user.uid}/${selectedLoan.id}_${Date.now()}_${proofFile.name}`);
        await uploadBytes(fileRef, proofFile);
        proofUrl = await getDownloadURL(fileRef);
      }

      await recordRepaymentAction({
        loanId: selectedLoan.id,
        amount,
        proofUrl,
        justification
      });

      toast({ title: "Payment Submitted", description: "Your repayment is awaiting management verification." });
      setIsRepayOpen(false);
    } catch (error: any) {
      const appErr = parseAppError(error);
      toast({ variant: "destructive", title: appErr.title, description: appErr.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyRepayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRepayment || !isManagement) return;
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Network Connection Lost",
        description: "Unable to verify repayments while offline. Please check your connection."
      });
      return;
    }
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      await verifyRepaymentAction({
        repaymentId: selectedRepayment.id,
        justification
      });
      toast({ title: "Repayment Verified", description: "Loan balance has been updated." });
      setIsVerifyRepayOpen(false);
      await loadLiquidityMetrics();
    } catch (error: any) {
      const appErr = parseAppError(error);
      toast({ variant: "destructive", title: appErr.title, description: appErr.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !isManagement) return;
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Network Connection Lost",
        description: "Unable to disburse funds while offline. Please check your connection."
      });
      return;
    }

    const requestedAmt = Number(selectedLoan.amount) || 0;
    const availableGroupPool = liquidityMetrics ? Number(liquidityMetrics.availableLendingPool) : Infinity;
    if (requestedAmt > availableGroupPool) {
      toast({
        variant: "destructive",
        title: "No Funds Available to Loan From",
        description: `This loan of ${formatCurrency(requestedAmt, currency)} exceeds the lending pool ceiling of ${liquidityMetrics?.maxLendingPoolPercentage ?? 90}% (${formatCurrency(availableGroupPool, currency)} currently available).`
      });
      return;
    }

    setIsSubmitting(true);
    
    const calculatedInterest = Math.round(selectedLoan.amount * (globalRate / 100));

    const terms = {
      interestAmount: calculatedInterest,
      durationMonths: Number(new FormData(e.currentTarget).get('durationMonths')),
      startDate: new FormData(e.currentTarget).get('startDate') as string,
      interestType: globalInterestType || 'immediate',
      penaltyRate: globalPenaltyRate,
      checkUrl: ''
    };
    const justification = new FormData(e.currentTarget).get('justification') as string;

    try {
      await approveLoanAction({ loanId: selectedLoan.id, terms, justification });
      toast({ title: "Loan Approved", description: "Borrower has been notified and funds released." });
      setIsApproveOpen(false);
      setIsReviewOpen(false);
      await loadLiquidityMetrics();
    } catch (error: any) {
      const appErr = parseAppError(error);
      toast({ variant: "destructive", title: appErr.title, description: appErr.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !isManagement) return;
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Network Connection Lost",
        description: "Unable to process loan rejection while offline. Please check your connection."
      });
      return;
    }
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      await rejectLoanAction({ loanId: selectedLoan.id, justification });
      toast({ title: "Loan Rejected", description: "Request has been archived." });
      setIsRejectOpen(false);
      setIsReviewOpen(false);
    } catch (error: any) {
      const appErr = parseAppError(error);
      toast({ variant: "destructive", title: appErr.title, description: appErr.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (dueDate: any, status: string, paidAmount: number = 0, targetAmount: number = 0, remainingAmount?: number) => {
    const d = parseSafeDate(dueDate) || new Date();
    const rem = remainingAmount !== undefined ? remainingAmount : Math.max(0, targetAmount - paidAmount);
    
    if (status === 'paid' || (targetAmount > 0 && rem <= 0)) {
      return (
        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 border-none px-2.5 py-0.5 font-bold uppercase text-[9px] text-white">
          Paid
        </Badge>
      );
    }
    
    if (status === 'partially_paid' || paidAmount > 0) {
      if (isPast(d)) {
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 font-bold uppercase text-[9px]">
            Partial (Overdue)
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 px-2.5 py-0.5 font-bold uppercase text-[9px]">
          Partial
        </Badge>
      );
    }
    
    if (isPast(d)) {
      return (
        <Badge variant="destructive" className="animate-pulse px-2.5 py-0.5 font-bold uppercase text-[9px]">
          Arrears
        </Badge>
      );
    }
    
    return <Badge variant="secondary" className="px-2.5 py-0.5 font-bold uppercase text-[9px]">Pending</Badge>;
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-36 sm:pb-24 w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">Lending & Capital</h1>
          <p className="text-[12px] font-bold text-muted-foreground">Manage borrowing cycles and repayment schedules</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
           {isManagement && (
             <Button asChild className="rounded-[10px] font-bold text-[12px] h-10 px-5 shadow-sm">
               <Link href="/loans/apply">
                 <Plus className="mr-2 h-4 w-4" /> Apply for Loan
               </Link>
             </Button>
           )}
           <div className="grid grid-cols-2 sm:flex gap-1.5 sm:gap-2 w-full sm:w-auto">
              {!isManagement && (
                <div className="bg-primary/5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-[10px] border border-primary/20 text-center flex-1 sm:min-w-[120px]">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-tighter">Borrow Power</p>
                    <p data-stat-value="true" className="text-xs sm:text-sm font-bold text-primary">{formatCurrency(memberBorrowingPower, currency)}</p>
                </div>
              )}
              {isManagement && (
                <div className={cn(
                  "px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-[10px] border text-center flex-1 sm:min-w-[130px]",
                  liquidityMetrics && liquidityMetrics.availableLendingPool <= 0 
                    ? "bg-destructive/10 border-destructive/30" 
                    : "bg-emerald-500/10 border-emerald-500/30"
                )}>
                    <p className="text-[10px] font-bold text-foreground uppercase tracking-tighter">
                      Lending Pool ({liquidityMetrics?.maxLendingPoolPercentage ?? 90}%)
                    </p>
                    <p data-stat-value="true" className={cn(
                      "text-xs sm:text-sm font-bold",
                      liquidityMetrics && liquidityMetrics.availableLendingPool <= 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                    )}>
                      {loadingLiquidity ? "..." : formatCurrency(liquidityMetrics?.availableLendingPool ?? 0, currency)}
                    </p>
                </div>
              )}
              <div className="bg-muted px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-[10px] border border-border text-center flex-1 sm:min-w-[110px]">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-tighter">Gained Int.</p>
                  <p data-stat-value="true" className="text-xs sm:text-sm font-bold text-green-600">+{formatCurrency(interestSummary.gained, currency)}</p>
              </div>
              <div className="bg-muted px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-[10px] border border-border text-center flex-1 sm:min-w-[110px]">
                  <p className="text-[10px] font-bold text-foreground uppercase tracking-tighter">Int. Paid</p>
                  <p data-stat-value="true" className="text-xs sm:text-sm font-bold text-foreground">-{formatCurrency(interestSummary.paid, currency)}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Member Alerts: Pending Loan Withdrawal & Top-Up Opportunities */}
      {!isManagement && (
        <div className="space-y-4">
            {myPending && (
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-600 rounded-lg">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">
                      Pending Loan Application: {formatCurrency(myPending.amount, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted on {myPending.requestDate?.toDate ? format(myPending.requestDate.toDate(), 'PPP') : 'recently'}. Currently undergoing management credit audit.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLoanToWithdraw(myPending);
                    setIsWithdrawOpen(true);
                  }}
                  className="rounded-xl border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 font-bold text-xs gap-1.5 shrink-0"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Withdraw Request
                </Button>
              </div>
            )}

            {canTopUp && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-600 rounded-lg">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-foreground">
                        Loan Top-Up Available: {formatCurrency(myRepaid, currency)}
                      </p>
                      <Badge className="bg-emerald-600 text-white font-bold text-[9px] uppercase">
                        Eligible
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You have repaid {formatCurrency(myRepaid, currency)} of your active loan. You can apply for a top-up loan today!
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0 gap-1.5"
                >
                  <Link href={`/loans/apply?topup=true&parentLoanId=${myActive?.id}`}>
                    <TrendingUp className="h-3.5 w-3.5" /> Apply for Top-Up
                  </Link>
                </Button>
              </div>
            )}
        </div>
      )}

      {isManagement && (pendingRepayments.length > 0 || pendingRequests.length > 0) && (
        <Card className="border-primary/20 bg-primary/5 shadow-inner">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Management Action Required
            </CardTitle>
            <CardDescription>Review pending loan requests and repayment submissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {pendingRequests.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">Pending Loan Requests</p>
                    <Badge variant="secondary" className="text-[10px] font-mono font-bold">
                      {pendingRequests.length} to review
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    Review applicant savings &amp; borrowing power before approval
                  </p>
                </div>

                <div className="rounded-[10px] border border-border overflow-hidden bg-card shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-5 py-3 text-[12px] font-bold uppercase tracking-widest">Applicant / Staff</TableHead>
                        <TableHead className="text-[12px] font-bold uppercase tracking-widest">Requested Amount</TableHead>
                        <TableHead className="text-[12px] font-bold uppercase tracking-widest">Current Savings</TableHead>
                        <TableHead className="text-[12px] font-bold uppercase tracking-widest">Borrowing Power ({maxLoanPercentage}%)</TableHead>
                        <TableHead className="text-[12px] font-bold uppercase tracking-widest">Borrow Status</TableHead>
                        <TableHead className="text-[12px] font-bold uppercase tracking-widest">Date</TableHead>
                        <TableHead className="text-right px-5 text-[12px] font-bold uppercase tracking-widest">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((r: any) => {
                        const memberContrib = getMemberVerifiedContributions(r.memberId);
                        const memberPower = getMemberBorrowingPower(r.memberId);
                        const isEligible = memberPower >= r.amount && memberPower > 0;
                        const applicantMember = getMember(r.memberId);

                        return (
                          <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border shrink-0">
                                  <AvatarImage src={applicantMember?.avatarUrl} />
                                  <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                    {getMemberName(r.memberId).slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs truncate">{getMemberName(r.memberId)}</p>
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                    {applicantMember?.email || r.description || 'Capital Request'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-sm text-primary">
                              {formatCurrency(r.amount, currency)}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {formatCurrency(memberContrib, currency)}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-foreground">
                              {formatCurrency(memberPower, currency)}
                            </TableCell>
                            <TableCell>
                              {liquidityMetrics && r.amount > liquidityMetrics.availableLendingPool ? (
                                <Badge className="bg-destructive/10 text-destructive border-none text-[9px] uppercase font-bold flex items-center gap-1 w-fit">
                                  <AlertOctagon className="h-3 w-3" /> Pool Ceiled
                                </Badge>
                              ) : r.exceedsBorrowingPower || r.managementApprovalUrl ? (
                                <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] uppercase font-bold flex items-center gap-1 w-fit">
                                  <ShieldAlert className="h-3 w-3" /> Approval Attached
                                </Badge>
                              ) : isEligible ? (
                                <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-none text-[9px] uppercase font-bold">
                                  Eligible ({memberPower > 0 ? Math.round((r.amount / memberPower) * 100) : 0}%)
                                </Badge>
                              ) : (
                                <Badge className="bg-muted text-foreground border-border text-[9px] uppercase font-bold">
                                  Exceeds Power
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {r.requestDate?.toDate 
                                ? format(r.requestDate.toDate(), 'MMM d, yyyy') 
                                : format(new Date(), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-right px-5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(r);
                                  setIsReviewOpen(true);
                                }}
                                className="h-8 rounded-[8px] font-bold text-xs gap-1.5 shadow-sm"
                              >
                                <Eye className="h-3.5 w-3.5" /> Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {pendingRepayments.length > 0 && (
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-primary/60">Repayment Evidence</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pendingRepayments.map((r: any) => (
                    <div key={r.id} className="bg-card p-4 rounded-[10px] border border-border flex flex-col gap-3 shadow-sm">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-muted-foreground">{getMemberName(r.memberId)}</span>
                        <Badge variant="outline" className="text-[9px] font-bold uppercase">Pending</Badge>
                      </div>
                      <div className="flex justify-between items-end">
                         <div>
                           <p className="text-lg font-bold text-primary">{formatCurrency(r.amount, currency)}</p>
                           <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{r.justification}</p>
                         </div>
                         <Button size="sm" onClick={() => { setSelectedRepayment(r); setIsVerifyRepayOpen(true); }} className="h-8 text-[11px] font-bold rounded-[10px]">
                           Verify Proof
                         </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="schedule" onValueChange={setActiveTab} className="w-full">
        <div className="w-full overflow-x-auto no-scrollbar pb-1 mb-6">
          <TabsList className="inline-flex w-full min-w-max md:min-w-0 md:grid md:grid-cols-4 h-12 p-1 bg-muted rounded-xl border border-border/60">
            <TabsTrigger value="schedule" className="gap-2 uppercase tracking-wider text-[11px] whitespace-nowrap px-3 sm:px-4">
              <Calendar className="h-4 w-4 shrink-0" /> {isManagement ? 'Active Loans' : 'Schedule'}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 uppercase tracking-wider text-[11px] whitespace-nowrap px-3 sm:px-4">
              <HistoryIcon className="h-4 w-4 shrink-0" /> History
            </TabsTrigger>
            <TabsTrigger value="interest" className="gap-2 uppercase tracking-wider text-[11px] whitespace-nowrap px-3 sm:px-4">
              <Landmark className="h-4 w-4 shrink-0" /> Interest
            </TabsTrigger>
            <TabsTrigger value="arrears" className="gap-2 uppercase tracking-wider text-[11px] whitespace-nowrap px-3 sm:px-4 relative">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Arrears
              {missedInstallments.length > 0 && (
                <span className="ml-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {missedInstallments.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="schedule" className="space-y-6">
          <Card className="border border-border shadow-sm bg-card rounded-[10px] overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 px-5 py-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <HandCoins className="h-5 w-5 text-white" /> Schedule
            </CardTitle>
          </CardHeader>
            <CardContent className="p-0">
              {isManagement ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 text-[12px] font-bold uppercase">Borrower</TableHead>
                      <TableHead className="text-[12px] font-bold uppercase">Description</TableHead>
                      <TableHead className="text-[12px] font-bold uppercase">Contract Amount</TableHead>
                      <TableHead className="text-[12px] font-bold uppercase">Current Balance</TableHead>
                      <TableHead className="text-right px-6 text-[12px] font-bold uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLoans ? (
                      <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : activeLoans.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic font-medium">No active repayment cycles in the system.</TableCell></TableRow>
                    ) : (
                      activeLoans.map((loan: any) => (
                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-3">
                               <div className="p-2 bg-primary/10 rounded-full">
                                  <UserIcon className="h-4 w-4 text-primary" />
                               </div>
                               <div className="font-bold text-sm">{getMemberName(loan.memberId)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground truncate max-w-[150px]">
                            {loan.description || 'Business Capital'}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {formatCurrency(loan.amount, currency)}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-primary">{formatCurrency(loan.balance || 0, currency)}</span>
                          </TableCell>
                          <TableCell className="text-right px-6">
                             <Button size="sm" variant="outline" className="h-8 rounded-[10px] font-bold text-[11px]" onClick={() => { setSelectedLoan(loan); setIsViewScheduleOpen(true); }}>
                               View Schedule <ChevronRight className="ml-1.5 h-3 w-3" />
                             </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 text-[12px] font-bold uppercase">Due Date</TableHead>
                      <TableHead className="text-[12px] font-bold uppercase">Amount</TableHead>
                      <TableHead className="text-[12px] font-bold uppercase">Status</TableHead>
                      <TableHead className="text-right px-6 text-[12px] font-bold uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLoans ? (
                      <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : activeLoans.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="h-48 text-center text-muted-foreground italic font-medium">No active repayment schedules found.</TableCell></TableRow>
                    ) : (
                      activeLoans.flatMap((loan: any) => (
                        loan.amortization?.map((inst: any) => {
                          const target = Number(inst.amount) || 0;
                          const paid = Number(inst.paidAmount) || (inst.status === 'paid' ? target : 0);
                          const remaining = inst.remainingAmount !== undefined ? Number(inst.remainingAmount) : Math.max(0, target - paid);
                          const isFullyPaid = inst.status === 'paid' || remaining <= 0;

                          return (
                            <TableRow key={`${loan.id}-${inst.installmentNumber}`} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="px-6 py-3.5">
                                <div className="font-bold text-sm text-foreground">
                                  {safeFormatDate(inst.dueDate, 'MMM d, yyyy')}
                                </div>
                              </TableCell>
                              <TableCell className="py-3.5">
                                <div className="font-semibold text-foreground text-sm">
                                  {formatCurrency(target, currency)}
                                </div>
                              </TableCell>
                              <TableCell className="py-3.5">
                                {getStatusBadge(inst.dueDate, inst.status, paid, target, remaining)}
                              </TableCell>
                              <TableCell className="text-right px-6 py-3.5">
                                {!isFullyPaid && (
                                  <Button 
                                    size="sm" 
                                    className="h-8 rounded-[10px] font-bold shadow-xs px-4" 
                                    onClick={() => { 
                                      setSelectedLoan(loan); 
                                      setSelectedInstallment(inst);
                                      setIsRepayOpen(true); 
                                    }}
                                  >
                                    Pay Now
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card className="border border-border shadow-sm bg-card rounded-[10px] overflow-hidden">
             <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-xl text-white">Loan Lifecycle Audit</CardTitle>
              <CardDescription className="text-blue-100">Comprehensive record of all requested, approved, and rejected loans.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6 text-[12px] font-bold uppercase">Purpose</TableHead>
                    <TableHead className="text-[12px] font-bold uppercase">Principal</TableHead>
                    <TableHead className="text-[12px] font-bold uppercase">Interest</TableHead>
                    <TableHead className="text-[12px] font-bold uppercase">Status</TableHead>
                    <TableHead className="text-[12px] font-bold uppercase">Balance</TableHead>
                    <TableHead className="text-right px-6 text-[12px] font-bold uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLoans ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : historyLoans.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic font-medium">No historical records found.</TableCell></TableRow>
                  ) : (
                    historyLoans.map((loan: any) => {
                      const isOwner = loan.memberId === user?.uid;
                      const repaid = getLoanRepaidPrincipal(loan.id, loan.amount);
                      const isEligibleTopUp = loan.status === 'approved' && (Number(loan.balance) || 0) > 0 && repaid >= minLoanAmount;

                      return (
                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-6 py-4">
                             <div className="font-bold text-sm flex items-center gap-1.5">
                               {loan.description || 'Capital Loan'}
                               {loan.isTopUp && (
                                 <Badge className="bg-primary/10 text-primary border-none text-[8px] uppercase font-bold">
                                   Top-Up
                                 </Badge>
                               )}
                             </div>
                             <div className="text-[10px] text-muted-foreground font-medium">{format(loan.requestDate?.toDate() || new Date(), 'MMM d, yyyy')}</div>
                          </TableCell>
                          <TableCell className="font-medium text-sm">{formatCurrency(loan.amount, currency)}</TableCell>
                          <TableCell className="text-xs text-foreground font-bold">{formatCurrency(loan.interestAmount || 0, currency)}</TableCell>
                          <TableCell>
                             <Badge 
                               variant={
                                 loan.status === 'rejected' ? 'destructive' : 
                                 loan.status === 'requested' ? 'secondary' : 
                                 loan.status === 'withdrawn' ? 'outline' : 'outline'
                               } 
                               className={cn(
                                 "uppercase font-bold text-[9px] border-none",
                                 loan.status === 'requested' && "bg-primary/10 text-primary",
                                 loan.status === 'approved' && "bg-green-600/10 text-green-700 dark:text-green-400",
                                 loan.status === 'withdrawn' && "bg-muted text-muted-foreground",
                                 loan.status === 'rejected' && "bg-black text-white",
                                 loan.status === 'completed' && "bg-muted text-muted-foreground"
                               )}
                             >
                               {loan.status}
                             </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-primary">{formatCurrency(loan.balance || 0, currency)}</TableCell>
                          <TableCell className="text-right px-6">
                            {loan.status === 'requested' && isOwner && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setLoanToWithdraw(loan);
                                  setIsWithdrawOpen(true);
                                }}
                                className="h-7 text-xs font-bold rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10"
                              >
                                <Undo2 className="h-3 w-3 mr-1" /> Withdraw
                              </Button>
                            )}

                            {isEligibleTopUp && isOwner && (
                              <Button
                                size="sm"
                                asChild
                                variant="outline"
                                className="h-7 text-xs font-bold rounded-lg border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                              >
                                <Link href={`/loans/apply?topup=true&parentLoanId=${loan.id}`}>
                                  <TrendingUp className="h-3 w-3 mr-1" /> Top-Up
                                </Link>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interest" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border border-border shadow-sm bg-card rounded-[10px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <TrendingUp className="h-5 w-5" /> Interest Gained
                </CardTitle>
                <CardDescription>Dividends accrued from the global pool pro-rata.</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="text-4xl font-bold text-green-600">{formatCurrency(interestSummary.gained, currency)}</div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Verified Earnings</p>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm bg-card rounded-[10px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <TrendingDown className="h-5 w-5 text-muted-foreground" /> Interest Paid
                </CardTitle>
                <CardDescription>Total interest overhead committed on loans.</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="text-4xl font-bold text-foreground">{formatCurrency(interestSummary.paid, currency)}</div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Cumulative Liability</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="arrears" className="space-y-6">
          <Card className="border-destructive/20 border shadow-sm bg-card rounded-[10px] overflow-hidden">
            <CardHeader className="bg-destructive/5 border-b border-destructive/10">
              <CardTitle className="text-xl flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Arrears & Missed Windows
              </CardTitle>
              <CardDescription className="text-destructive/80 font-medium">Urgent: Installments that have exceeded their contractual due date.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Source Loan</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Missed Due Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Arrears Amount</TableHead>
                    {!isManagement && <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-widest">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missedInstallments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic font-medium">Great news! You have no arrears.</TableCell></TableRow>
                  ) : (
                    missedInstallments.map((inst: any, idx: number) => {
                      const target = Number(inst.amount) || 0;
                      const paid = Number(inst.paidAmount) || 0;
                      const remaining = inst.remainingAmount !== undefined ? Number(inst.remainingAmount) : Math.max(0, target - paid);

                      return (
                        <TableRow key={idx} className="bg-destructive/5 hover:bg-destructive/10 transition-colors border-destructive/5">
                          <TableCell className="px-6 py-4 font-bold text-destructive text-sm">
                             <div>{inst.description || 'Personal Loan'}</div>
                             <div className="text-xs font-normal text-muted-foreground">Installment #{inst.installmentNumber}</div>
                          </TableCell>
                          <TableCell className="text-sm font-bold text-destructive">
                             {safeFormatDate(inst.dueDate, 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="font-semibold text-sm">{formatCurrency(target, currency)}</TableCell>
                          <TableCell className="font-medium text-emerald-600 text-sm">
                            {paid > 0 ? `+${formatCurrency(paid, currency)}` : '-'}
                          </TableCell>
                          <TableCell className="font-bold text-destructive">{formatCurrency(remaining, currency)}</TableCell>
                          {!isManagement && (
                            <TableCell className="text-right px-6">
                               <Button size="sm" variant="destructive" className="h-8 rounded-[10px] font-bold shadow-lg" onClick={() => { 
                                 const loan = loans.find(l => l.id === inst.loanId);
                                 setSelectedLoan(loan); 
                                 setSelectedInstallment(inst);
                                 setIsRepayOpen(true); 
                               }}>
                                  Clear Arrears
                               </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bottom Loan Action CTA - Floating on Mobile, Integrated on Desktop (Harmonized with Savings) */}
      {!isManagement && (
        <div className="fixed bottom-20 left-3.5 right-3.5 z-40 sm:static sm:z-auto sm:pt-4 sm:flex sm:justify-end">
          {canTopUp ? (
            <Button 
              asChild 
              className="w-full sm:w-auto h-12 sm:h-11 px-6 rounded-xl font-bold text-sm shadow-xl sm:shadow-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 border border-blue-500/40 backdrop-blur-md active:scale-[0.98] transition-all"
            >
              <Link href={`/loans/apply?topup=true&parentLoanId=${myActive?.id}`}>
                <TrendingUp className="h-4 w-4" /> Apply for Top-Up
              </Link>
            </Button>
          ) : !myActive && !myPending ? (
            <Button 
              asChild 
              className="w-full sm:w-auto h-12 sm:h-11 px-6 rounded-xl font-bold text-sm shadow-xl sm:shadow-md bg-primary text-primary-foreground flex items-center justify-center gap-2 backdrop-blur-md active:scale-[0.98] transition-all"
            >
              <Link href="/loans/apply">
                <Plus className="h-4 w-4" /> Apply for Loan
              </Link>
            </Button>
          ) : null}
        </div>
      )}

      {/* VIEW LOAN SCHEDULE DIALOG (Management Only) */}
      <Dialog open={isViewScheduleOpen} onOpenChange={setIsViewScheduleOpen}>
        <DialogContent className="max-w-3xl rounded-[10px] bg-card p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-muted/30 border-b">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-blue-600">
              <Calendar className="h-5 w-5 text-blue-600" /> Loan Repayment Schedule
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown for {selectedLoan ? getMemberName(selectedLoan.memberId) : 'member'}'s capital loan.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-blue-600 p-3.5 rounded-xl border border-blue-700/50 shadow-sm text-white flex flex-col justify-center">
                   <p className="text-[10px] font-bold uppercase text-blue-100 tracking-wider mb-1">Contract Principal</p>
                   <p className="text-base sm:text-lg font-extrabold text-white">{selectedLoan ? formatCurrency(selectedLoan.amount, currency) : '-'}</p>
                </div>
                <div className="bg-blue-600 p-3.5 rounded-xl border border-blue-700/50 shadow-sm text-white flex flex-col justify-center">
                   <p className="text-[10px] font-bold uppercase text-blue-100 tracking-wider mb-1">Upfront Interest ({globalRate}%)</p>
                   <p className="text-base sm:text-lg font-extrabold text-white">-{selectedLoan ? formatCurrency(selectedLoan.interestAmount || 0, currency) : '-'}</p>
                </div>
                <div className="bg-blue-600 p-3.5 rounded-xl border border-blue-700/50 shadow-sm text-white flex flex-col justify-center">
                   <p className="text-[10px] font-bold uppercase text-blue-100 tracking-wider mb-1">Amount Received</p>
                   <p className="text-base sm:text-lg font-extrabold text-white">
                     {selectedLoan ? formatCurrency(selectedLoan.netDisbursed ?? (selectedLoan.amount - (selectedLoan.interestAmount || 0)), currency) : '-'}
                   </p>
                </div>
                <div className="bg-blue-600 p-3.5 rounded-xl border border-blue-700/50 shadow-sm text-white flex flex-col justify-center">
                   <p className="text-[10px] font-bold uppercase text-blue-100 tracking-wider mb-1">Outstanding Balance</p>
                   <p className="text-base sm:text-lg font-extrabold text-white">{selectedLoan ? formatCurrency(selectedLoan.balance || 0, currency) : '-'}</p>
                </div>
             </div>

             <div className="max-h-[400px] overflow-auto border rounded-xl">
               <Table>
                  <TableHeader className="sticky top-0 bg-blue-600 z-10 shadow-sm">
                     <TableRow className="border-b border-blue-700/50 hover:bg-transparent">
                       <TableHead className="text-[11px] font-bold uppercase text-white py-3 px-4">Due Date</TableHead>
                       <TableHead className="text-[11px] font-bold uppercase text-white py-3 px-4">Amount</TableHead>
                       <TableHead className="text-[11px] font-bold uppercase text-white text-right py-3 px-4">Status</TableHead>
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedLoan?.amortization?.map((inst: any) => {
                      const target = Number(inst.amount) || 0;
                      const paid = Number(inst.paidAmount) || (inst.status === 'paid' ? target : 0);
                      const remaining = inst.remainingAmount !== undefined ? Number(inst.remainingAmount) : Math.max(0, target - paid);
                      const isFullyPaid = inst.status === 'paid' || remaining <= 0;

                      return (
                        <TableRow key={inst.installmentNumber}>
                          <TableCell className="py-3 px-4">
                            <div className="font-bold text-sm text-foreground">
                              {safeFormatDate(inst.dueDate, 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <div className="font-semibold text-foreground text-sm">
                              {formatCurrency(target, currency)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-3 px-4">
                             {getStatusBadge(inst.dueDate, inst.status, paid, target, remaining)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
             </div>
          </div>
          <DialogFooter className="p-4 bg-muted/10 border-t">
             <Button variant="ghost" onClick={() => setIsViewScheduleOpen(false)} className="rounded-[10px] font-bold">Close View</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOAN REVIEW & UNDERWRITING DIALOG (Management / Admin) */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-3xl lg:max-w-4xl rounded-2xl bg-card p-0 overflow-hidden shadow-2xl border border-border [&>button]:text-white [&>button]:opacity-90 hover:[&>button]:opacity-100">
          {selectedLoan && (() => {
            const applicantMember = getMember(selectedLoan.memberId);
            const memberName = getMemberName(selectedLoan.memberId);
            const verifiedContributions = getMemberVerifiedContributions(selectedLoan.memberId);
            const borrowingPower = getMemberBorrowingPower(selectedLoan.memberId);
            const activeDebt = getMemberActiveDebt(selectedLoan.memberId);
            const netAvailablePower = Math.max(0, borrowingPower - activeDebt);
            const requestedAmt = Number(selectedLoan.amount) || 0;
            const isEligible = borrowingPower >= requestedAmt && borrowingPower > 0;
            const coveragePercent = borrowingPower > 0 ? Math.round((requestedAmt / borrowingPower) * 100) : 0;
            const loanInterest = Math.round(requestedAmt * (globalRate / 100));
            // In accordance with upfront interest policy:
            // One-off interest is deducted from the approved loan at disbursement:
            // Amount received (disbursed) = loan amount - interest (e.g. 300,000 - 30,000 = 270,000)
            // Total repayable over the term = loan amount (300,000) since interest is paid upfront
            const isImmediate = (globalInterestType || 'immediate') !== 'afterward';
            const totalPayable = isImmediate ? requestedAmt : (requestedAmt + loanInterest);
            const amountReceived = isImmediate ? Math.max(0, requestedAmt - loanInterest) : requestedAmt;
            const loanDuration = Number(selectedLoan.durationMonths) || 12;
            const monthlyPayment = Math.round(totalPayable / loanDuration);

            const availableGroupPool = liquidityMetrics ? Number(liquidityMetrics.availableLendingPool) : Infinity;
            const lendingPoolCeilingPct = liquidityMetrics?.maxLendingPoolPercentage ?? 90;
            const isPoolExhausted = requestedAmt > availableGroupPool;
            const maxLendingPool = liquidityMetrics?.maxLendingPool ?? 0;
            const currentActiveLoanBalance = liquidityMetrics?.currentActiveLoanBalance ?? 0;

            return (
              <form onSubmit={handleApproveLoan} className="flex flex-col max-h-[90vh]">
                {/* Header */}
                <DialogHeader className="bg-blue-600 text-white p-4 sm:p-6 pb-4 border-b border-blue-700/30">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="mb-1.5">
                        <Badge className="bg-white/20 text-white hover:bg-white/30 border-none text-[9px] uppercase font-bold tracking-widest">
                          Credit Review
                        </Badge>
                      </div>
                      <DialogTitle className="text-xl sm:text-2xl font-bold font-headline text-white">
                        Loan Application &amp; Borrowing Status
                      </DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm text-blue-100 mt-1">
                        Review applicant verified savings, borrowing capacity, and terms prior to approval.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Body */}
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
                  {/* Applicant Profile Bar */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-card border border-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarImage src={applicantMember?.avatarUrl} />
                        <AvatarFallback className="text-xs font-bold bg-blue-50 text-blue-600">
                          {memberName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{memberName}</p>
                        <p className="text-xs text-muted-foreground truncate">{applicantMember?.email || 'Registered Member'}</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                      <p className="font-semibold text-blue-600 uppercase tracking-wider text-[10px]">Requested On</p>
                      <p className="text-foreground font-medium mt-0.5">{selectedLoan.requestDate?.toDate ? format(selectedLoan.requestDate.toDate(), 'PPP') : format(new Date(), 'PPP')}</p>
                    </div>
                  </div>

                  {/* 4 Core Metric Cards: Requested Amount, Current Contribution, Borrowing Power, Group Lending Pool */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
                    {/* Requested Amount */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-blue-600 text-white border border-blue-700/50 shadow-sm flex flex-col justify-between min-w-0">
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100 block truncate">
                          Requested Loan
                        </span>
                        <p className="text-base sm:text-lg lg:text-xl font-bold text-white font-mono mt-1 truncate">
                          {formatCurrency(requestedAmt, currency)}
                        </p>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-blue-100 mt-1.5 truncate">
                        Term: <strong className="text-white">{loanDuration} Months</strong>
                      </p>
                    </div>

                    {/* Current Contribution */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-blue-600 text-white border border-blue-700/50 shadow-sm flex flex-col justify-between min-w-0">
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100 block truncate">
                          Member Savings
                        </span>
                        <p className="text-base sm:text-lg lg:text-xl font-bold text-white font-mono mt-1 truncate">
                          {formatCurrency(verifiedContributions, currency)}
                        </p>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-blue-100 mt-1.5 truncate">
                        Total Verified
                      </p>
                    </div>

                    {/* Borrowing Power */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-blue-600 text-white border border-blue-700/50 shadow-sm flex flex-col justify-between min-w-0">
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100 block truncate">
                          Borrow Power ({maxLoanPercentage}%)
                        </span>
                        <p className="text-base sm:text-lg lg:text-xl font-bold text-white font-mono mt-1 truncate">
                          {formatCurrency(borrowingPower, currency)}
                        </p>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-blue-100 mt-1.5 truncate">
                        {maxLoanPercentage}% Policy Limit
                      </p>
                    </div>

                    {/* Lending Pool */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-blue-600 text-white border border-blue-700/50 shadow-sm flex flex-col justify-between min-w-0">
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100 block truncate">
                          Lending Pool ({lendingPoolCeilingPct}%)
                        </span>
                        <p className="text-base sm:text-lg lg:text-xl font-bold text-white font-mono mt-1 truncate">
                          {loadingLiquidity ? "..." : formatCurrency(availableGroupPool, currency)}
                        </p>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-blue-100 mt-1.5 truncate">
                        Available to Lend
                      </p>
                    </div>
                  </div>

                  {/* Lending Pool Ceiling Alert Banner */}
                  {isPoolExhausted && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3.5 text-destructive">
                      <AlertOctagon className="h-5 w-5 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-sm">
                          No Funds Available to Loan From (Ceiling Reached)
                        </p>
                        <p className="leading-relaxed opacity-95">
                          The lending pool ceiling is set at <strong>{lendingPoolCeilingPct}% of total net assets</strong> ({formatCurrency(maxLendingPool, currency)}).
                          Distributed active loans across all members currently total <strong>{formatCurrency(currentActiveLoanBalance, currency)}</strong>, leaving only <strong>{formatCurrency(availableGroupPool, currency)}</strong> available in the lending pool.
                          This loan application of <strong>{formatCurrency(requestedAmt, currency)}</strong> cannot be approved or disbursed until active loans are repaid or capital increases.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Borrow Status Assessment Card */}
                  <div className={cn(
                    "p-4 rounded-xl border flex items-start gap-3.5",
                    isEligible ? "bg-green-600/10 border-green-600/20 text-green-900 dark:text-green-200" : "bg-muted border-border text-foreground"
                  )}>
                    {isEligible ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm">
                        {isEligible 
                          ? `Eligible: Requested loan is within borrowing power (${coveragePercent}%)` 
                          : `Policy Alert: Requested amount exceeds borrowing power`}
                      </p>
                      <p className="leading-relaxed opacity-95">
                        {isEligible ? (
                          <>
                            The applicant has <strong>{formatCurrency(verifiedContributions, currency)}</strong> in verified savings, entitling them to borrow up to <strong>{formatCurrency(borrowingPower, currency)}</strong> under the {maxLoanPercentage}% policy.
                            {activeDebt > 0 && ` (Existing active debt: ${formatCurrency(activeDebt, currency)}, net headroom: ${formatCurrency(netAvailablePower, currency)}).`}
                          </>
                        ) : (
                          <>
                            The requested amount of <strong>{formatCurrency(requestedAmt, currency)}</strong> exceeds the calculated borrowing power of <strong>{formatCurrency(borrowingPower, currency)}</strong> by <strong>{formatCurrency(requestedAmt - borrowingPower, currency)}</strong>. Member has <strong>{formatCurrency(verifiedContributions, currency)}</strong> in verified savings.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Management Approval Exception Card */}
                  {(selectedLoan.exceedsBorrowingPower || selectedLoan.managementApprovalUrl) && (
                    <div className="p-4 rounded-xl bg-white dark:bg-card border border-border shadow-sm text-foreground space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0" />
                          <p className="font-bold text-sm">
                            Management Quota Exception Authorized
                          </p>
                        </div>
                        <Badge className="bg-blue-600 text-white font-bold text-[10px] uppercase w-fit">
                          Attached Proof
                        </Badge>
                      </div>

                      <p className="text-xs text-foreground/90 leading-relaxed">
                        This application requested <strong>{formatCurrency(requestedAmt, currency)}</strong>, exceeding the member&apos;s standard {maxLoanPercentage}% borrowing power ({formatCurrency(borrowingPower, currency)}) by <strong>{formatCurrency(requestedAmt - borrowingPower, currency)}</strong>. An official management authorization has been attached.
                      </p>

                      {selectedLoan.managementApprovalNotes && (
                        <div className="p-2.5 rounded-lg bg-background/80 border border-border text-xs">
                          <span className="font-bold text-foreground">Approval Minute / Reference: </span>
                          <span className="text-muted-foreground">&ldquo;{selectedLoan.managementApprovalNotes}&rdquo;</span>
                        </div>
                      )}

                      {selectedLoan.managementApprovalUrl && (
                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                          <Button
                            type="button"
                            asChild
                            size="sm"
                            className="h-9 rounded-xl font-bold text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
                          >
                            <a href={selectedLoan.managementApprovalUrl} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4" />
                              View Management Approval Attachment ({selectedLoan.managementApprovalFileName || 'Document'})
                              <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Purpose / Description */}
                  {selectedLoan.description && (
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                        Applicant Stated Purpose
                      </Label>
                      <div className="p-3 bg-muted/40 rounded-xl text-xs text-foreground italic border border-border/50">
                        &ldquo;{selectedLoan.description}&rdquo;
                      </div>
                    </div>
                  )}

                  {/* Repayment Breakdown */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-muted/30 border border-border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                        Financial Schedule Projection
                      </p>
                      <Badge className={cn("text-white font-bold text-[9px] uppercase w-fit", isImmediate ? "bg-emerald-600" : "bg-blue-600")}>
                        {isImmediate ? "Upfront Interest Deduction" : "Interest Added to Principal"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg border border-border shadow-sm overflow-hidden bg-white dark:bg-card flex flex-col min-w-0">
                        <div className="bg-blue-600 text-white px-2 py-1 border-b border-blue-700/30">
                          <p className="text-[10px] text-white uppercase font-semibold truncate">Approved Loan</p>
                        </div>
                        <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground truncate">{formatCurrency(requestedAmt, currency)}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border shadow-sm overflow-hidden bg-white dark:bg-card flex flex-col min-w-0">
                        <div className="bg-blue-600 text-white px-2 py-1 border-b border-blue-700/30">
                          <p className="text-[10px] text-white uppercase font-semibold truncate">Interest ({globalRate}%)</p>
                        </div>
                        <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground truncate">-{formatCurrency(loanInterest, currency)}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border shadow-sm overflow-hidden bg-white dark:bg-card flex flex-col min-w-0">
                        <div className="bg-blue-600 text-white px-2 py-1 border-b border-blue-700/30">
                          <p className="text-[10px] text-white uppercase font-semibold truncate">Amount Received</p>
                        </div>
                        <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground truncate">{formatCurrency(amountReceived, currency)}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border shadow-sm overflow-hidden bg-white dark:bg-card flex flex-col min-w-0">
                        <div className="bg-blue-600 text-white px-2 py-1 border-b border-blue-700/30">
                          <p className="text-[10px] text-white uppercase font-semibold truncate">Total Repayable</p>
                        </div>
                        <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground truncate">{formatCurrency(totalPayable, currency)}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5 truncate">({formatCurrency(monthlyPayment, currency)}/mo)</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                      {isImmediate ? (
                        <>* Interest of {formatCurrency(loanInterest, currency)} is deducted upfront from the approved loan. Borrower receives {formatCurrency(amountReceived, currency)} and repays {formatCurrency(totalPayable, currency)} over {loanDuration} months ({formatCurrency(monthlyPayment, currency)}/mo).</>
                      ) : (
                        <>* Interest of {formatCurrency(loanInterest, currency)} is added to the principal. Borrower receives {formatCurrency(amountReceived, currency)} and repays {formatCurrency(totalPayable, currency)} over {loanDuration} months ({formatCurrency(monthlyPayment, currency)}/mo).</>
                      )}
                    </p>
                  </div>

                  {/* Approval Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider">Duration (Months)</Label>
                      <Input 
                        name="durationMonths" 
                        type="number" 
                        defaultValue={loanDuration} 
                        required 
                        min="1" 
                        max="60"
                        className="h-10 rounded-xl bg-muted/40 border-border" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider">Disbursement Date</Label>
                      <Input 
                        name="startDate" 
                        type="date" 
                        defaultValue={new Date().toISOString().split('T')[0]} 
                        required 
                        className="h-10 rounded-xl bg-muted/40 border-border" 
                      />
                    </div>
                  </div>

                  {/* Audit Justification */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider">Audit Approval / Credit Note</Label>
                    <Textarea 
                      name="justification" 
                      placeholder="Credit committee approval rationale, e.g. Approved within 200% savings limit..." 
                      required 
                      rows={2}
                      className="rounded-xl bg-muted/40 border-border text-xs resize-none" 
                    />
                  </div>
                </div>

                {/* Footer Controls */}
                <DialogFooter className="p-4 sm:p-6 pt-3 sm:pt-4 bg-muted/20 border-t flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsReviewOpen(false);
                      setIsRejectOpen(true);
                    }}
                    className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-10 sm:h-11 px-5 w-full sm:w-auto"
                  >
                    <Ban className="mr-2 h-4 w-4" /> Reject Request
                  </Button>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsReviewOpen(false)}
                      className="rounded-xl font-bold h-10 sm:h-11 px-4 flex-1 sm:flex-none"
                    >
                      Close
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || isPoolExhausted}
                      className={cn(
                        "rounded-xl font-bold text-white shadow-lg h-10 sm:h-11 px-6 flex-1 sm:flex-none",
                        isPoolExhausted 
                          ? "bg-muted text-muted-foreground cursor-not-allowed border border-border" 
                          : "bg-green-600 hover:bg-green-700"
                      )}
                    >
                      {isSubmitting ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : isPoolExhausted ? (
                        <AlertOctagon className="mr-2 h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {isPoolExhausted ? "No Funds Available in Pool" : "Approve & Disburse"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* APPROVE LOAN DIALOG (Management Only) */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="max-w-md rounded-[10px] bg-card">
          {(() => {
            const isLoanPoolCeiled = selectedLoan && liquidityMetrics && Number(selectedLoan.amount) > Number(liquidityMetrics.availableLendingPool);
            const availableGroupPool = liquidityMetrics ? Number(liquidityMetrics.availableLendingPool) : Infinity;

            return (
              <form onSubmit={handleApproveLoan}>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Approve Loan Request</DialogTitle>
                  <DialogDescription>Define the legal repayment terms for this request.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-6">
                  {/* Pool Alert Banner */}
                  {isLoanPoolCeiled && (
                    <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-[10px] flex items-start gap-2.5 text-destructive text-xs">
                      <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold">No Funds Available to Loan From</p>
                        <p className="opacity-90">
                          Lending pool ceiling ({liquidityMetrics?.maxLendingPoolPercentage ?? 90}%) has only {formatCurrency(availableGroupPool, currency)} available.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-muted rounded-[10px] border border-border">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Approved Loan Amount</p>
                    <p className="text-2xl font-bold text-primary">{selectedLoan ? formatCurrency(selectedLoan.amount, currency) : '-'}</p>
                    {selectedLoan && (
                      <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Upfront Interest ({globalRate}%):</span>
                          <span className="font-bold text-foreground">-{formatCurrency(Math.round(selectedLoan.amount * (globalRate / 100)), currency)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Amount Received:</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(Math.max(0, selectedLoan.amount - Math.round(selectedLoan.amount * (globalRate / 100))), currency)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        Interest Amount <Lock className="h-3 w-3 text-muted-foreground" />
                      </Label>
                      <div className="h-11 rounded-[10px] bg-muted px-3 flex items-center font-bold text-sm text-foreground/60 border border-border/50">
                        {selectedLoan ? formatCurrency(Math.round(selectedLoan.amount * (globalRate / 100)), currency) : '-'}
                      </div>
                      <p className="text-[9px] text-muted-foreground">Locked by system rate: {globalRate}%</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Months</Label>
                      <Input name="durationMonths" type="number" defaultValue="12" required className="h-11 rounded-[10px] bg-muted border-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Start Date</Label>
                      <Input name="startDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="h-11 rounded-[10px] bg-muted border-none" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        Penalty Rate (%) <Lock className="h-3 w-3 text-muted-foreground" />
                      </Label>
                      <div className="h-11 rounded-[10px] bg-muted px-3 flex items-center font-bold text-sm text-foreground/60 border border-border/50">
                        {globalPenaltyRate}%
                      </div>
                      <p className="text-[9px] text-muted-foreground">Locked by board policy</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                      Interest Deduction Policy <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <div className="h-11 rounded-[10px] bg-muted px-3 flex items-center font-bold text-sm text-foreground/60 capitalize border border-border/50">
                      {globalInterestType === 'immediate' ? 'Upfront Deduction' : 'Pay Later (Added to Principal)'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification</Label>
                    <Textarea name="justification" placeholder="E.g., Approved per credit policy..." required className="rounded-[10px] bg-muted border-none min-h-[80px]" />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || isLoanPoolCeiled} 
                    className={cn(
                      "w-full h-12 rounded-[10px] font-bold text-white shadow-lg",
                      isLoanPoolCeiled 
                        ? "bg-muted text-muted-foreground cursor-not-allowed border border-border" 
                        : "bg-green-600 hover:bg-green-700"
                    )}
                  >
                    {isSubmitting ? (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    ) : isLoanPoolCeiled ? (
                      <AlertOctagon className="mr-2 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {isLoanPoolCeiled ? "No Funds Available in Lending Pool" : "Release Funds & Approve"}
                  </Button>
                </DialogFooter>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* REJECT LOAN DIALOG (Management Only) */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="max-w-md rounded-[10px] bg-card">
          <form onSubmit={handleRejectLoan}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-destructive">Reject Loan Request</DialogTitle>
              <DialogDescription>This action will archive the request and notify the borrower.</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
               <div className="p-4 bg-destructive/5 border border-destructive/10 rounded-[10px]">
                  <p className="text-[10px] font-bold uppercase text-destructive tracking-widest mb-1">Target Request</p>
                  <p className="text-lg font-bold">{selectedLoan ? formatCurrency(selectedLoan.amount, currency) : '-'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{selectedLoan?.description}</p>
               </div>
               <div className="space-y-2">
                 <Label className="text-xs font-bold uppercase tracking-wider">Rejection Reason</Label>
                 <Textarea name="justification" placeholder="E.g., Insufficient contribution weight..." required className="rounded-[10px] bg-muted border-none min-h-[100px]" />
               </div>
            </div>
            <DialogFooter>
               <Button type="submit" disabled={isSubmitting} variant="destructive" className="w-full h-12 rounded-[10px] font-bold shadow-lg shadow-destructive/20">
                 {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Ban className="mr-2 h-4 w-4" />}
                 Confirm Rejection
               </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REPAYMENT DIALOG */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="max-w-md rounded-[10px] bg-card">
          <form onSubmit={handleRepay}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Submit Repayment</DialogTitle>
              <DialogDescription className="font-medium">Submit your payment evidence for management verification.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Payment Reference / Note</Label>
                <Input name="justification" placeholder="e.g. Bank Transfer #12345" className="h-11 rounded-[10px] bg-muted border-none" required />
              </div>

              {/* Installment Breakdown Summary */}
              {(() => {
                const targetInst = selectedInstallment || selectedLoan?.amortization?.find((i: any) => {
                  const target = Number(i.amount) || 0;
                  const paid = Number(i.paidAmount) || (i.status === 'paid' ? target : 0);
                  const rem = i.remainingAmount !== undefined ? Number(i.remainingAmount) : Math.max(0, target - paid);
                  return i.status !== 'paid' && rem > 0;
                });
                const targetAmount = targetInst ? Number(targetInst.amount) || 0 : 0;
                const paidAmount = targetInst ? Number(targetInst.paidAmount) || (targetInst.status === 'paid' ? targetAmount : 0) : 0;
                const remainingInst = targetInst ? (targetInst.remainingAmount !== undefined ? Number(targetInst.remainingAmount) : Math.max(0, targetAmount - paidAmount)) : (selectedLoan?.balance || 0);

                return (
                  <>
                    <div className="p-4 bg-muted rounded-[10px] border border-border space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Loan Balance</span>
                         <span className="text-lg font-bold text-primary">{formatCurrency(selectedLoan?.balance || 0, currency)}</span>
                       </div>
                       {targetInst && (
                         <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                           <div>
                             <span className="font-semibold text-foreground">Installment #{targetInst.installmentNumber}</span>
                             {paidAmount > 0 && (
                               <span className="text-muted-foreground ml-1.5 text-[11px]">(Paid: {formatCurrency(paidAmount, currency)})</span>
                             )}
                           </div>
                           <div className="text-right">
                             <span className="text-[10px] text-muted-foreground block uppercase">Installment Due</span>
                             <span className="font-bold text-foreground">{formatCurrency(remainingInst, currency)}</span>
                           </div>
                         </div>
                       )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Payment Amount</Label>
                        {targetInst && remainingInst < (selectedLoan?.balance || 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.querySelector('input[name="repayAmount"]') as HTMLInputElement;
                              if (input) input.value = String(remainingInst);
                            }}
                            className="text-[11px] text-primary font-semibold hover:underline"
                          >
                            Pay Installment Due ({formatCurrency(remainingInst, currency)})
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input 
                          name="repayAmount" 
                          type="number" 
                          defaultValue={remainingInst > 0 ? remainingInst : undefined}
                          max={selectedLoan?.balance} 
                          required 
                          className="h-11 rounded-[10px] pr-12 bg-muted border-none font-bold" 
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{currency}</div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        You can pay in full or make a partial installment repayment.
                      </p>
                    </div>
                  </>
                );
              })()}

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest">Proof of Transfer</Label>
                <Input name="proofFile" type="file" required className="h-11 rounded-[10px] py-2.5 text-xs bg-muted border-none" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-[10px] font-bold shadow-lg">
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Submit for Verification
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* VERIFY REPAYMENT DIALOG (Management Only) */}
      <Dialog open={isVerifyRepayOpen} onOpenChange={setIsVerifyRepayOpen}>
        <DialogContent className="max-w-md rounded-[10px] bg-card">
          <form onSubmit={handleVerifyRepayment}>
            <DialogHeader>
              <DialogTitle className="font-bold">Verify Repayment Proof</DialogTitle>
              <DialogDescription className="font-medium">Validate payment evidence before updating member balance.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
               <div className="p-4 bg-muted rounded-[10px] space-y-2 border border-border">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-bold">Amount Claimed:</span>
                    <span className="font-bold text-sm">{selectedRepayment ? formatCurrency(selectedRepayment.amount, currency) : '-'}</span>
                  </div>
                  {selectedRepayment?.proofUrl && (
                    <Button variant="outline" size="sm" className="w-full mt-2 rounded-[10px] font-bold h-9" asChild>
                       <a href={selectedRepayment.proofUrl} target="_blank" rel="noopener noreferrer">
                         <Eye className="mr-2 h-4 w-4" /> View Bank Receipt
                       </a>
                    </Button>
                  )}
               </div>
               <div className="space-y-2">
                 <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification</Label>
                 <Textarea name="justification" placeholder="E.g., Confirmed receipt in bank statement..." required className="rounded-[10px] bg-muted border-none min-h-[100px]" />
               </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-[10px] font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg">
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Approve & Update Balance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WITHDRAW LOAN APPLICATION DIALOG */}
      <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive flex items-center gap-2">
              <Undo2 className="h-5 w-5" /> Withdraw Loan Application
            </DialogTitle>
            <DialogDescription>
              Cancel and withdraw your pending loan request of {loanToWithdraw ? formatCurrency(loanToWithdraw.amount, currency) : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-xs text-destructive">
              Once withdrawn, this request will be archived and you can submit a new loan application immediately.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Reason for Withdrawal (Optional)</Label>
              <Textarea 
                value={withdrawReason} 
                onChange={(e) => setWithdrawReason(e.target.value)} 
                placeholder="E.g., Altering loan amount, no longer required..." 
                className="rounded-xl bg-muted/40 text-xs resize-none" 
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsWithdrawOpen(false)} className="rounded-xl font-bold">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              disabled={isWithdrawing} 
              onClick={handleWithdrawLoan} 
              className="rounded-xl font-bold gap-1.5"
            >
              {isWithdrawing ? <Loader2 className="animate-spin h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
              Confirm Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LoansPage() {
  return (
    <Suspense fallback={<div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <LoansPageContent />
    </Suspense>
  );
}
