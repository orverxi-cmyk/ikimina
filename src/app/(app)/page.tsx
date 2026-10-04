'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wallet, HandCoins, Calendar, ArrowUpRight, CheckCircle2, Loader2, Sparkles, Clock, PiggyBank, Banknote, Check } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, doc, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { parseSafeDate, safeFormatDate } from '@/lib/loan-utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/context/settings-context';
import { setMemberPayoutPreferenceAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';

export default function DashboardPage() {
  const { user, loading: userAuthLoading } = useUser();
  const firestore = useFirestore();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const { settings, loading: settingsLoading } = useSettings();
  const currency = settings.currency;

  const { toast } = useToast();
  const [isUpdatingPreference, setIsUpdatingPreference] = useState(false);

  const campaign = settings.payoutCampaign;
  const isCampaignOpen = campaign?.status === 'open';
  const memberPreference = userData?.interestPayoutPreference || 'receive_payout';

  const handleUpdatePreference = async (preference: 'add_to_contribution' | 'receive_payout') => {
    if (!user) return;
    setIsUpdatingPreference(true);
    try {
      await setMemberPayoutPreferenceAction(preference);
      toast({
        title: "Payout Preference Updated",
        description: preference === 'add_to_contribution'
          ? "Your interest dividend will be added to your verified contributions."
          : "Your interest dividend will be credited as liquid cash payout.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message || "Failed to update payout preference.",
      });
    } finally {
      setIsUpdatingPreference(false);
    }
  };

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  const isLoading = userAuthLoading || userDataLoading || settingsLoading;

  const contributionsQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'contributions'));
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user, isManagement, isLoading, userData]);

  const loansQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'loans'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid));
  }, [user, isManagement, isLoading, userData]);

  const { data: contributionsSnap, loading: loadingConts } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);

  const rawStats = useMemo(() => {
    if (isLoading || loadingConts || loadingLoans) return null;

    const allConts = contributionsSnap?.docs.map(d => d.data()) || [];
    const verifiedContsTotal = allConts
      .filter((c: any) => c.status === 'verified')
      .reduce((acc, c: any) => acc + (c.amount || 0), 0);
    
    const pendingContsCount = allConts.filter((c: any) => c.status === 'pending').length;

    const activeLoansBalance = loansSnap?.docs.reduce((acc, d) => {
      const data = d.data();
      return acc + (data.status === 'approved' ? (data.balance || 0) : 0);
    }, 0) || 0;
    
    const availablePot = verifiedContsTotal - activeLoansBalance;

    return { verifiedContsTotal, pendingContsCount, activeLoansBalance, availablePot, accruedInterest: userData?.accruedInterest || 0 };
  }, [contributionsSnap, loansSnap, isManagement, isLoading, loadingConts, loadingLoans, userData]);

  // Format stats at render time so currency changes always apply immediately
  const stats = useMemo(() => {
    if (!rawStats) return [];
    const { verifiedContsTotal, pendingContsCount, activeLoansBalance, availablePot, accruedInterest } = rawStats;

    const baseStats = [
      { 
        title: isManagement ? 'Verified Pot Value' : 'My Verified Savings', 
        value: formatCurrency(isManagement ? availablePot : verifiedContsTotal, currency), 
        icon: Wallet, 
        color: 'text-green-600', 
        bg: 'bg-green-600/10' 
      },
      { 
        title: isManagement ? 'Total Tontine Assets' : 'Accrued Interest', 
        value: formatCurrency(isManagement ? verifiedContsTotal : accruedInterest, currency), 
        icon: Sparkles, 
        color: 'text-primary', 
        bg: 'bg-primary/10' 
      },
      { 
        title: isManagement ? 'Active Loan Book' : 'My Outstanding Debt', 
        value: formatCurrency(activeLoansBalance, currency), 
        icon: HandCoins, 
        color: 'text-foreground', 
        bg: 'bg-muted' 
      },
    ];

    if (isManagement) {
      baseStats.push({ title: 'Pending Audits', value: pendingContsCount.toString(), icon: Clock, color: 'text-primary', bg: 'bg-primary/10' });
    } else {
      baseStats.push({ title: 'Pending Verification', value: pendingContsCount.toString(), icon: Clock, color: 'text-primary', bg: 'bg-primary/10' });
    }

    return baseStats;
  }, [rawStats, currency, isManagement]);

  const myParticipation = useMemo(() => {
    if (!user || !contributionsSnap || !loansSnap) return { contributions: 0, debt: 0, nextPayment: null };
    
    const myVerifiedConts = contributionsSnap.docs
      .filter(d => d.data().memberId === user.uid && d.data().status === 'verified')
      .reduce((acc, d) => acc + (d.data().amount || 0), 0);
      
    const myActiveLoans = loansSnap.docs
      .filter(d => d.data().memberId === user.uid && d.data().status === 'approved');
      
    const totalDebt = myActiveLoans.reduce((acc, d) => acc + (d.data().balance || 0), 0);

    let nextInst = null;
    if (totalDebt > 0 && userData?.amortizationSchedule) {
      nextInst = userData.amortizationSchedule
        .filter((s: any) => {
          const target = Number(s.amount) || 0;
          const paid = Number(s.paidAmount) || (s.status === 'paid' ? target : 0);
          const rem = s.remainingAmount !== undefined ? Number(s.remainingAmount) : Math.max(0, target - paid);
          return s.status !== 'paid' && rem > 0;
        })
        .sort((a: any, b: any) => {
          const da = parseSafeDate(a.dueDate)?.getTime() || 0;
          const db = parseSafeDate(b.dueDate)?.getTime() || 0;
          return da - db;
        })[0];
    }

    return { contributions: myVerifiedConts, debt: totalDebt, nextPayment: nextInst };
  }, [user, contributionsSnap, loansSnap, userData]);

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="space-y-0.5">
          <h1 className="text-[13px] font-bold font-headline text-foreground">Financial Portfolio</h1>
          <p className="text-[12px] font-bold text-muted-foreground">Welcome back, {userData?.name || 'Member'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
           {!isManagement && (
             <Button asChild className="rounded-[10px] font-bold text-[12px] h-10 px-5 shadow-md shadow-green-200 bg-green-600 hover:bg-green-700 flex-1 sm:flex-none">
               <Link href="/contributions">
                 <Wallet className="mr-2 h-4 w-4" /> Submit Savings
               </Link>
             </Button>
           )}
        </div>
      </div>

      {/* Member Dividend Payout Preference Election Banner */}
      {isCampaignOpen && (
        <Card className="border-2 border-primary/40 shadow-xl bg-gradient-to-br from-primary/5 via-card to-primary/10 rounded-2xl overflow-hidden">
          <CardHeader className="bg-primary/10 border-b border-primary/20 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground font-bold text-[10px] tracking-wide uppercase px-2.5 py-0.5">
                    Action Required
                  </Badge>
                  <span className="text-xs font-bold text-primary flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Dividend Payout Selection
                  </span>
                </div>
                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                  Select Your Preferred Dividend Payout
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {campaign?.announcement ||
                    "Management has initiated an interest distribution. Please select whether you want your dividend added to your savings or received as cash."}
                </CardDescription>
              </div>
              {campaign?.targetAmount && campaign.targetAmount > 0 ? (
                <div className="bg-background/80 backdrop-blur-sm border border-primary/20 rounded-xl px-3 py-2 text-right shrink-0">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Target Dividend Pool</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(campaign.targetAmount, currency)}</p>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Option A: Add to Total Contribution */}
              <button
                type="button"
                disabled={isUpdatingPreference}
                onClick={() => handleUpdatePreference('add_to_contribution')}
                className={cn(
                  "flex flex-col text-left p-4 sm:p-5 rounded-xl border-2 transition-all relative group cursor-pointer",
                  memberPreference === 'add_to_contribution'
                    ? "border-green-600 bg-green-500/10 shadow-md ring-2 ring-green-600/20"
                    : "border-border bg-card/60 hover:border-green-500/50 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="p-2.5 rounded-xl bg-green-500/10 text-green-600">
                    <PiggyBank className="h-5 w-5" />
                  </div>
                  {memberPreference === 'add_to_contribution' ? (
                    <Badge className="bg-green-600 text-white font-bold text-[10px] gap-1 px-2 py-0.5">
                      <Check className="h-3 w-3" /> Selected
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-green-600">
                      Select
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-foreground">Add to Total Contribution</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Reinvest dividend directly into your verified savings. Increases your borrowing power and capital base. Excluded from cash payout.
                </p>
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-400">
                  <Sparkles className="h-3 w-3 shrink-0" /> Automatically capitalized into savings
                </div>
              </button>

              {/* Option B: Receive Payout */}
              <button
                type="button"
                disabled={isUpdatingPreference}
                onClick={() => handleUpdatePreference('receive_payout')}
                className={cn(
                  "flex flex-col text-left p-4 sm:p-5 rounded-xl border-2 transition-all relative group cursor-pointer",
                  memberPreference === 'receive_payout'
                    ? "border-blue-600 bg-blue-500/10 shadow-md ring-2 ring-blue-600/20"
                    : "border-border bg-card/60 hover:border-blue-500/50 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                    <Banknote className="h-5 w-5" />
                  </div>
                  {memberPreference === 'receive_payout' ? (
                    <Badge className="bg-blue-600 text-white font-bold text-[10px] gap-1 px-2 py-0.5">
                      <Check className="h-3 w-3" /> Selected
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-blue-600">
                      Select
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-foreground">Receive Cash Payout</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Receive your dividend as withdrawable cash. Credited to your accrued interest balance for payout disbursement.
                </p>
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                  <Wallet className="h-3 w-3 shrink-0" /> Available for direct cash payout
                </div>
              </button>
            </div>
            {isUpdatingPreference && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-primary">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving your preference...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-md bg-card hover:scale-[1.01] transition-transform cursor-default">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">{stat.title}</CardTitle>
              <div className={cn("p-2 rounded-xl", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div data-stat-value="true" className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        <Card className="bg-card border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
              <ArrowUpRight className="h-4 w-4 text-primary" /> Active Position
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3.5 sm:p-4 bg-muted rounded-xl border border-primary/5 hover:border-primary/20 transition-colors">
              <span className="text-muted-foreground font-normal text-[12px]">Verified Assets (Savings + Interest)</span>
              <span data-stat-value="true" className="font-bold text-base sm:text-lg text-primary">
                {formatCurrency(myParticipation.contributions + (userData?.accruedInterest || 0), currency)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3.5 sm:p-4 bg-muted rounded-xl border border-border hover:border-foreground/20 transition-colors">
              <span className="text-muted-foreground font-normal text-[12px]">Current Liabilities (Active Loans)</span>
              <span data-stat-value="true" className="font-bold text-base sm:text-lg text-foreground">-{formatCurrency(myParticipation.debt, currency)}</span>
            </div>
            <div className="flex justify-between items-center p-3.5 sm:p-4 bg-muted rounded-xl border border-border hover:border-foreground/20 transition-colors">
              <div className="flex flex-col">
                <span className="text-muted-foreground font-normal text-[12px]">Dividend Payout Preference</span>
                <span className="text-[10px] text-muted-foreground">
                  {memberPreference === 'add_to_contribution'
                    ? 'Reinvested into verified savings'
                    : 'Credited as withdrawable liquid interest'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Badge
                  className={cn(
                    "text-[10px] sm:text-[11px] font-bold py-0.5 sm:py-1 px-2 sm:px-2.5 border-none",
                    memberPreference === 'add_to_contribution'
                      ? "bg-green-600/15 text-green-700 dark:text-green-400"
                      : "bg-blue-600/15 text-blue-700 dark:text-blue-400"
                  )}
                >
                  {memberPreference === 'add_to_contribution' ? 'Contribution' : 'Cash Payout'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isUpdatingPreference}
                  onClick={() =>
                    handleUpdatePreference(
                      memberPreference === 'add_to_contribution' ? 'receive_payout' : 'add_to_contribution'
                    )
                  }
                  className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                >
                  Switch
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
              <Calendar className="h-4 w-4 text-primary" /> Scheduled Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myParticipation.nextPayment ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 bg-muted rounded-xl border border-primary/10 hover:bg-muted/80 transition-colors cursor-pointer">
                  <div className="bg-primary p-2.5 rounded-lg text-primary-foreground shadow-sm shadow-primary/20">
                    <HandCoins className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-bold truncate">Repayment Installment #{myParticipation.nextPayment.installmentNumber}</p>
                      {Number(myParticipation.nextPayment.paidAmount) > 0 && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          Partial
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-normal text-muted-foreground">
                      Due: {safeFormatDate(myParticipation.nextPayment.dueDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span data-stat-value="true" className="text-sm sm:text-base font-bold whitespace-nowrap block">
                      {formatCurrency(myParticipation.nextPayment.remainingAmount ?? myParticipation.nextPayment.amount, currency)}
                    </span>
                    {Number(myParticipation.nextPayment.paidAmount) > 0 && (
                      <span className="text-[10px] text-muted-foreground block">
                        of {formatCurrency(myParticipation.nextPayment.amount, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground space-y-2">
                <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                <p className="text-[12px] font-normal">No upcoming debt obligations</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
