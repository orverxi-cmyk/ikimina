
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, HandCoins, Users, Calendar, ArrowUpRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, doc, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { formatCurrency } from '@/lib/currency';

export default function DashboardPage() {
  const { user, loading: userAuthLoading } = useUser();
  const firestore = useFirestore();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);
  
  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData } = useDoc(settingsRef);
  const currency = settingsData?.currency || 'RWF';

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  const isLoading = userAuthLoading || userDataLoading;

  const contributionsQuery = useMemoFirebase(() => {
    if (!user || isLoading) return null;
    if (isManagement) return query(collection(firestore, 'contributions'));
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user, isManagement, isLoading]);

  const loansQuery = useMemoFirebase(() => {
    if (!user || isLoading) return null;
    if (isManagement) return query(collection(firestore, 'loans'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid));
  }, [user, isManagement, isLoading]);

  const membersQuery = useMemoFirebase(() => {
    if (!user || isLoading || !isManagement) return null;
    return query(collection(firestore, 'users'));
  }, [user, isManagement, isLoading]);

  const { data: contributionsSnap, loading: loadingConts } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);

  const stats = useMemo(() => {
    if (isLoading || loadingConts || loadingLoans) return [];

    const totalConts = contributionsSnap?.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0) || 0;
    const activeLoansBalance = loansSnap?.docs.reduce((acc, d) => {
      const data = d.data();
      return acc + (data.status === 'approved' ? (data.balance || 0) : 0);
    }, 0) || 0;
    
    const availablePot = totalConts - activeLoansBalance;

    const baseStats = [
      { 
        title: isManagement ? 'Available Pot' : 'My Contributions', 
        value: formatCurrency(isManagement ? availablePot : (contributionsSnap?.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0) || 0), currency), 
        icon: Wallet, 
        color: 'text-green-500', 
        bg: 'bg-green-500/10' 
      },
      { 
        title: isManagement ? 'Total Tontine Wealth' : 'Accrued Interest', 
        value: formatCurrency(isManagement ? totalConts : (userData?.accruedInterest || 0), currency), 
        icon: Sparkles, 
        color: 'text-primary', 
        bg: 'bg-primary/10' 
      },
      { 
        title: isManagement ? 'Active Loan Book' : 'My Active Debt', 
        value: formatCurrency(activeLoansBalance, currency), 
        icon: HandCoins, 
        color: 'text-orange-500', 
        bg: 'bg-orange-500/10' 
      },
    ];

    if (isManagement) {
      baseStats.push({ title: 'Member Count', value: membersSnap?.size.toString() || '0', icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10' });
    }

    return baseStats;
  }, [contributionsSnap, loansSnap, membersSnap, isManagement, isLoading, loadingConts, loadingLoans, userData, currency]);

  const myParticipation = useMemo(() => {
    if (!user || !contributionsSnap || !loansSnap) return { contributions: 0, debt: 0, nextPayment: null };
    
    const myConts = contributionsSnap.docs
      .filter(d => d.data().memberId === user.uid)
      .reduce((acc, d) => acc + (d.data().amount || 0), 0);
      
    const myActiveLoans = loansSnap.docs
      .filter(d => d.data().memberId === user.uid && d.data().status === 'approved');
      
    const totalDebt = myActiveLoans.reduce((acc, d) => acc + (d.data().balance || 0), 0);

    let nextInst = null;
    if (userData?.amortizationSchedule) {
      nextInst = userData.amortizationSchedule
        .filter((s: any) => s.status !== 'paid')
        .sort((a: any, b: any) => {
          const da = a.dueDate instanceof Timestamp ? a.dueDate.toDate() : new Date(a.dueDate);
          const db = b.dueDate instanceof Timestamp ? b.dueDate.toDate() : new Date(b.dueDate);
          return da.getTime() - db.getTime();
        })[0];
    }

    return { contributions: myConts, debt: totalDebt, nextPayment: nextInst };
  }, [user, contributionsSnap, loansSnap, userData]);

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-headline font-bold">Financial Overview</h1>
          <p className="text-muted-foreground font-medium">Hello, {userData?.name || 'Member'}</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Current Date</p>
          <p className="text-lg font-bold">{format(new Date(), 'MMMM do, yyyy')}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-md bg-card hover:scale-[1.02] transition-transform cursor-default">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.title}</CardTitle>
              <div className={cn("p-2 rounded-xl", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-none shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowUpRight className="h-5 w-5 text-primary" /> My Participation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-5 bg-background/50 rounded-2xl border border-primary/5 hover:border-primary/20 transition-colors">
              <span className="text-muted-foreground font-medium">Accumulated Interest</span>
              <span className="font-bold text-xl text-primary">+{formatCurrency(userData?.accruedInterest || 0, currency)}</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-background/50 rounded-2xl border border-orange-500/5 hover:border-orange-500/20 transition-colors">
              <span className="text-muted-foreground font-medium">Outstanding Debt</span>
              <span className="font-bold text-xl text-orange-500">{formatCurrency(myParticipation.debt, currency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-none shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" /> Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myParticipation.nextPayment ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-5 bg-background/50 rounded-2xl border border-primary/10 hover:bg-background/80 transition-colors cursor-pointer">
                  <div className="bg-primary p-3 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
                    <HandCoins className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">Loan Installment #{myParticipation.nextPayment.installmentNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: {format(myParticipation.nextPayment.dueDate instanceof Timestamp ? myParticipation.nextPayment.dueDate.toDate() : new Date(myParticipation.nextPayment.dueDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className="text-lg font-bold">{formatCurrency(myParticipation.nextPayment.amount, currency)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500/50" />
                <p className="text-sm font-medium">No upcoming loan payments</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
