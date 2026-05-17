'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Loader2, PieChart, ShieldAlert, TrendingUp, Wallet, HandCoins } from 'lucide-react';
import { useCollection, useDoc } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';

export default function ReportsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: userData, loading: userLoading } = useDoc(user ? doc(firestore, 'users', user.uid) : null);

  const role = userData?.role || 'member';
  const isAuthorized = role === 'admin' || role === 'management';

  // Firestore Queries
  const membersQuery = useMemo(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), [firestore]);
  const contributionsQuery = useMemo(() => query(collection(firestore, 'contributions'), orderBy('date', 'desc')), [firestore]);
  const loansQuery = useMemo(() => query(collection(firestore, 'loans'), orderBy('requestDate', 'desc')), [firestore]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);

  // Financial Calculations
  const reportData = useMemo(() => {
    const totalContributed = contributions.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
    
    const loanStats = loans.reduce((acc, loan: any) => {
      const amount = Number(loan.amount) || 0;
      const balance = Number(loan.balance) || 0;
      
      if (loan.status === 'approved') {
        acc.activePrincipal += amount;
        acc.outstandingBalance += balance;
        acc.activeCount++;
      } else if (loan.status === 'completed') {
        acc.completedCount++;
      }
      return acc;
    }, { activePrincipal: 0, outstandingBalance: 0, activeCount: 0, completedCount: 0 });

    const memberSummaries = members.map((m: any) => {
      const memberConts = contributions.filter((c: any) => c.memberId === m.id);
      const total = memberConts.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
      const memberLoans = loans.filter((l: any) => l.memberId === m.id && l.status === 'approved');
      const debt = memberLoans.reduce((acc, curr: any) => acc + (Number(curr.balance) || 0), 0);
      
      return {
        name: m.name,
        email: m.email,
        totalContributed: total,
        currentDebt: debt,
      };
    });

    return {
      totalContributed,
      activeLoansPrincipal: loanStats.activePrincipal,
      outstandingLoansBalance: loanStats.outstandingBalance,
      activeLoansCount: loanStats.activeCount,
      completedLoansCount: loanStats.completedCount,
      totalSCDTBalance: totalContributed - (loanStats.activePrincipal - loanStats.outstandingBalance),
      memberSummaries
    };
  }, [members, contributions, loans]);

  const exportToCSV = () => {
    const headers = ['Member Name', 'Total Contributed (RWF)', 'Current Debt (RWF)'];
    const rows = reportData.memberSummaries.map(m => [
      m.name,
      m.totalContributed.toString(),
      m.currentDebt.toString()
    ]);

    const csvContent = [
      ['SCDT TONTINE FINANCIAL REPORT'],
      [`Generated on: ${new Date().toLocaleDateString()}`],
      [],
      ['SUMMARY'],
      ['Total Contributions', reportData.totalContributed.toString()],
      ['Total SCDT Balance', reportData.totalSCDTBalance.toString()],
      ['Active Loans', reportData.activeLoansCount.toString()],
      [],
      headers,
      ...rows
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `SCDT_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (userLoading || loadingMembers || loadingContributions || loadingLoans) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view financial reports.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Financial Reports</h1>
          <p className="text-muted-foreground">Comprehensive overview of SCDT Tontine health</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="hidden md:flex">
            <FileText className="mr-2 h-4 w-4" /> Print PDF
          </Button>
          <Button onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">Total Contributions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalContributed.toLocaleString()} RWF</div>
            <TrendingUp className="h-4 w-4 text-primary mt-1" />
          </CardContent>
        </Card>

        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-green-600">SCDT Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalSCDTBalance.toLocaleString()} RWF</div>
            <Wallet className="h-4 w-4 text-green-600 mt-1" />
          </CardContent>
        </Card>

        <Card className="bg-orange-500/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-orange-600">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.activeLoansCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Outstanding: {reportData.outstandingLoansBalance.toLocaleString()} RWF</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-600">Completed Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.completedLoansCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Successfully repaid</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" /> Member Standings
          </CardTitle>
          <CardDescription>Individual contribution totals and current liabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member Name</TableHead>
                <TableHead className="text-right">Total Contributed</TableHead>
                <TableHead className="text-right">Current Debt</TableHead>
                <TableHead className="text-right">Net Standing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.memberSummaries.map((m, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    {m.name}
                    <div className="text-[10px] text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell className="text-right">{m.totalContributed.toLocaleString()} RWF</TableCell>
                  <TableCell className="text-right text-orange-600 font-medium">
                    {m.currentDebt > 0 ? m.currentDebt.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {(m.totalContributed - m.currentDebt).toLocaleString()} RWF
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
