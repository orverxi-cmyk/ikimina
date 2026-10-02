'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertCircle
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, doc, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { useSettings } from '@/context/settings-context';
import { requestLoanAction } from '@/lib/finance-client';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function LoanApplyPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState<string>('');

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
  const loans = useMemo(() => loansSnap?.docs.map(d => d.data()) || [], [loansSnap]);

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

  // 3. Compute Borrowing Power: configured percentage (e.g. 200%) of verified contributions
  const borrowingPower = useMemo(() => {
    return Math.round((totalVerifiedContributions * maxLoanPercentage) / 100);
  }, [totalVerifiedContributions, maxLoanPercentage]);

  // 4. Effective Max Limit capped by system-wide maxLoanAmount
  const effectiveMaxLimit = useMemo(() => {
    return Math.min(borrowingPower, maxLoanAmount);
  }, [borrowingPower, maxLoanAmount]);

  // 5. Loan status guards
  const pendingLoan = useMemo(() => loans.find((l: any) => l.status === 'requested'), [loans]);
  const activeLoan = useMemo(() => loans.find((l: any) => l.status === 'approved' && (Number(l.balance) || 0) > 0), [loans]);

  const hasSavings = totalVerifiedContributions > 0;
  const isBorrowingPowerEligible = effectiveMaxLimit >= minLoanAmount;
  const canApply = hasSavings && isBorrowingPowerEligible && !pendingLoan && !activeLoan;

  const minRequiredSavings = useMemo(() => {
    if (maxLoanPercentage <= 0) return 0;
    return Math.ceil(minLoanAmount / (maxLoanPercentage / 100));
  }, [minLoanAmount, maxLoanPercentage]);

  const numericAmount = Number(requestedAmount) || 0;
  const isAmountTooLow = numericAmount > 0 && numericAmount < minLoanAmount;
  const isAmountTooHigh = numericAmount > effectiveMaxLimit && effectiveMaxLimit > 0;

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

    if (activeLoan) {
      toast({ 
        variant: "destructive", 
        title: "Active Loan Outstanding", 
        description: `You must clear your active loan balance (${formatCurrency(activeLoan.balance, currency)}) before requesting a new loan.` 
      });
      return;
    }

    if (!hasSavings) {
      toast({ 
        variant: "destructive", 
        title: "No Verified Savings", 
        description: "You must have verified savings contributions in the group to unlock borrowing power." 
      });
      return;
    }

    if (!isBorrowingPowerEligible) {
      toast({ 
        variant: "destructive", 
        title: "Borrowing Power Too Low", 
        description: `Your borrowing limit (${formatCurrency(effectiveMaxLimit, currency)}) is below the minimum allowed loan (${formatCurrency(minLoanAmount, currency)}).` 
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

    if (amount > effectiveMaxLimit) {
      toast({ 
        variant: "destructive", 
        title: "Limit Exceeded", 
        description: `You cannot request more than your borrowing limit of ${formatCurrency(effectiveMaxLimit, currency)}.` 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await requestLoanAction({
        amount,
        description,
        durationMonths: 12
      });

      toast({ 
        title: "Application Submitted", 
        description: "Your loan request has been sent to management for audit and approval." 
      });
      router.push('/loans');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Application Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = userDataLoading || loansLoading || contributionsLoading || settingsLoading;

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
          <h1 className="text-2xl font-headline font-bold">Request Capital Loan</h1>
          <p className="text-sm text-muted-foreground">Submit a borrowing request based on your verified contribution standing</p>
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

        {/* Minimum Allowed Loan */}
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

        {/* System Max Cap */}
        <div className="p-4 bg-card rounded-[10px] border border-border space-y-1 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Lock className="h-3 w-3 text-orange-600" /> System Cap
          </p>
          <p className="text-lg font-bold text-orange-600">
            {formatCurrency(maxLoanAmount, currency)}
          </p>
          <p className="text-[9px] text-muted-foreground font-medium">
            Global maximum ceiling
          </p>
        </div>
      </div>

      {/* Informational Alerts & Eligibility Status */}
      {pendingLoan && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Pending Application Under Review</p>
            <p className="text-blue-800">
              You already have a submitted loan request of <strong>{formatCurrency(pendingLoan.amount, currency)}</strong> currently undergoing management audit. You can track its status in your Portfolio.
            </p>
          </div>
        </div>
      )}

      {activeLoan && (
        <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Active Loan Outstanding</p>
            <p className="text-orange-800">
              You currently have an active loan with an outstanding balance of <strong>{formatCurrency(activeLoan.balance, currency)}</strong>. System policy requires clearing active loans in full before submitting new capital requests.
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
              <CardTitle className="text-lg">Loan Application</CardTitle>
            </div>
            {canApply && (
              <Badge className="bg-green-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
                Eligible to Borrow
              </Badge>
            )}
          </div>
          <CardDescription>
            Request a group capital loan up to your maximum borrowing power ({maxLoanPercentage}% of verified contributions).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleApply} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="loan-amount" className="text-xs font-bold uppercase tracking-wider">
                    Requested Amount
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">
                      MIN: <strong className="text-foreground">{formatCurrency(minLoanAmount, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-[10px] font-bold text-primary">
                      MAX: <strong>{formatCurrency(effectiveMaxLimit, currency)}</strong>
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
                    placeholder={`Enter amount (${minLoanAmount} - ${effectiveMaxLimit > 0 ? effectiveMaxLimit : maxLoanAmount})`}
                    min={canApply ? minLoanAmount : undefined}
                    max={canApply ? effectiveMaxLimit : undefined}
                    step="1"
                    disabled={!canApply || isSubmitting}
                    required 
                    className={`h-12 rounded-[10px] pr-14 bg-muted border-2 text-lg font-bold ${
                      isAmountTooHigh ? 'border-destructive focus-visible:ring-destructive' :
                      isAmountTooLow ? 'border-orange-500 focus-visible:ring-orange-500' :
                      numericAmount >= minLoanAmount && numericAmount <= effectiveMaxLimit ? 'border-green-500/50' : 'border-transparent'
                    }`} 
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none">
                    {currency}
                  </div>
                </div>

                {/* Quick Selection Buttons */}
                {canApply && (
                  <div className="flex items-center gap-2 pt-1">
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
                    {effectiveMaxLimit > minLoanAmount && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRequestedAmount(Math.round(minLoanAmount + (effectiveMaxLimit - minLoanAmount) * 0.5).toString())}
                        className="h-7 text-[11px] rounded-lg px-2.5 font-bold hover:border-primary/50"
                      >
                        50%: {formatCurrency(Math.round(minLoanAmount + (effectiveMaxLimit - minLoanAmount) * 0.5), currency)}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRequestedAmount(effectiveMaxLimit.toString())}
                      className="h-7 text-[11px] rounded-lg px-2.5 font-bold hover:border-primary/50 text-primary border-primary/30"
                    >
                      Max: {formatCurrency(effectiveMaxLimit, currency)}
                    </Button>
                  </div>
                )}

                {/* Validation helper messages */}
                {isAmountTooHigh && (
                  <p className="text-xs text-destructive font-bold flex items-center gap-1 pt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Amount exceeds your borrowing limit of {formatCurrency(effectiveMaxLimit, currency)}.
                  </p>
                )}
                {isAmountTooLow && (
                  <p className="text-xs text-orange-600 font-bold flex items-center gap-1 pt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Amount is below the minimum allowed loan of {formatCurrency(minLoanAmount, currency)}.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan-description" className="text-xs font-bold uppercase tracking-wider">
                  Purpose of Loan
                </Label>
                <Textarea 
                  id="loan-description"
                  name="description" 
                  placeholder="E.g., Small business expansion, inventory purchase, tuition fees, etc." 
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
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={!canApply || isSubmitting || isAmountTooLow || isAmountTooHigh || numericAmount <= 0} 
              className="w-full h-14 rounded-[10px] font-bold shadow-lg text-lg transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Submitting Request...
                </>
              ) : !hasSavings ? (
                "Contributions Required to Borrow"
              ) : !isBorrowingPowerEligible ? (
                `Borrowing Limit Below Minimum (${formatCurrency(minLoanAmount, currency)})`
              ) : pendingLoan ? (
                "Loan Request Pending Audit"
              ) : activeLoan ? (
                "Active Loan Must Be Cleared"
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
    </div>
  );
}
