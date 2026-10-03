'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, HandCoins, Calendar, ArrowUpRight, CheckCircle2, Loader2, Sparkles, Clock } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, doc, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { formatCurrency } from '@/lib/currency';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';

export default function DashboardPage() {
  const { user, loading: userAuthLoading } = useUser();
  const firestore = useFirestore();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const { settings, loading: settingsLoading } = useSettings();
  const currency = settings.currency;

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
        .filter((s: any) => s.status !== 'paid')
        .sort((a: any, b: any) => {
          const da = a.dueDate instanceof Timestamp ? a.dueDate.toDate() : new Date(a.dueDate);
          const db = b.dueDate instanceof Timestamp ? b.dueDate.toDate() : new Date(b.dueDate);
          return da.getTime() - db.getTime();
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
                    <p className="text-[12px] font-bold truncate">Repayment Installment #{myParticipation.nextPayment.installmentNumber}</p>
                    <p className="text-[12px] font-normal text-muted-foreground">
                      Due: {format(myParticipation.nextPayment.dueDate instanceof Timestamp ? myParticipation.nextPayment.dueDate.toDate() : new Date(myParticipation.nextPayment.dueDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span data-stat-value="true" className="text-sm sm:text-base font-bold whitespace-nowrap">{formatCurrency(myParticipation.nextPayment.amount, currency)}</span>
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
