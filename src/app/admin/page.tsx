'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Wallet, 
  Landmark, 
  ArrowUpRight, 
  FileSpreadsheet, 
  Upload, 
  ShieldCheck, 
  Download,
  Settings,
  ArrowRight,
  TrendingUp
} from "lucide-react";
import { useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { downloadStaffContributionTemplate } from '@/lib/excel-template';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function AdminDashboard() {
  const firestore = useFirestore();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  // Subscriptions
  const usersQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: usersSnap } = useCollection(usersQuery);

  const contributionsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contributions'));
  }, [firestore]);
  const { data: contributionsSnap } = useCollection(contributionsQuery);

  const loansQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'loans'));
  }, [firestore]);
  const { data: loansSnap } = useCollection(loansQuery);

  const batchesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contribution_batches'), orderBy('createdAt', 'desc'), limit(5));
  }, [firestore]);
  const { data: batchesSnap } = useCollection(batchesQuery);

  const users = useMemo(() => usersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [usersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const recentBatches = useMemo(() => batchesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [batchesSnap]);

  const totalPool = useMemo(() => {
    return contributions
      .filter((c: any) => c.status === 'verified')
      .reduce((acc, c: any) => acc + (Number(c.amount) || 0), 0);
  }, [contributions]);

  const activeLoanAmount = useMemo(() => {
    return loans
      .filter((l: any) => l.status === 'approved' || l.status === 'active')
      .reduce((acc, l: any) => acc + (Number(l.amount) || 0), 0);
  }, [loans]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold tracking-widest">
              Executive Console
            </Badge>
          </div>
          <h1 className="text-3xl font-headline font-bold tracking-tight">Admin & Finance Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor institutional savings, manage payroll source deductions, and govern credit facilities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild className="rounded-xl font-bold gap-2 shadow-lg h-11 px-5">
            <Link href="/admin/contributions">
              <Upload className="h-4 w-4" /> Bulk Upload Contributions
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Savings Pot</CardTitle>
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">{formatCurrency(totalPool, currency)}</div>
            <p className="text-xs text-muted-foreground mt-1">Verified member contributions</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Loan Portfolio</CardTitle>
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600">
              <Landmark className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">{formatCurrency(activeLoanAmount, currency)}</div>
            <p className="text-xs text-muted-foreground mt-1">Disbursed capital at work</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Registered Staff</CardTitle>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">{users.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Enrolled scheme participants</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Borrowing Power Multiplier</CardTitle>
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">{settings.maxLoanPercentage || 200}%</div>
            <p className="text-xs text-muted-foreground mt-1">Of verified member contributions</p>
          </CardContent>
        </Card>
      </div>

      {/* Primary Feature Highlight: Source Deductions Upload */}
      <Card className="shadow-md border-primary/20 bg-gradient-to-r from-primary/5 via-card to-background">
        <CardContent className="pt-6 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground border-none text-[10px] uppercase font-bold">
                Accountant Tool
              </Badge>
              <span className="text-xs text-muted-foreground font-semibold">Monthly Payroll Integration</span>
            </div>
            <h3 className="text-xl font-bold font-headline">
              Upload Staff Contributions from Excel
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deduct contributions at source and upload in bulk using standard Excel or CSV files. Automatically cross-references staff by email, validates amounts, and updates member balances instantly.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadStaffContributionTemplate({ defaultAmount: 50000 })}
              className="rounded-xl font-bold text-xs gap-2 bg-card"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              Download Template (.xlsx)
            </Button>

            <Button asChild size="sm" className="rounded-xl font-bold text-xs gap-2 shadow-md">
              <Link href="/admin/contributions">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Go to Bulk Upload <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members & Audit Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Members */}
        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold">Registered Members</CardTitle>
              <CardDescription>Scheme participants and system roles</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs font-bold text-primary">
              <Link href="/members">
                Manage All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="px-5">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right px-5">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.slice(0, 5).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold text-xs px-5">{u.name || 'Member'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-right px-5">
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-[9px] uppercase font-bold border-none",
                          u.role === 'admin' && "bg-primary/10 text-primary",
                          u.role === 'accountant' && "bg-blue-500/10 text-blue-600",
                          u.role === 'management' && "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {u.role || 'member'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Batches */}
        <Card className="shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold">Recent Source Deduction Batches</CardTitle>
              <CardDescription>Processed bulk contribution uploads</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs font-bold text-primary">
              <Link href="/admin/contributions">
                Upload New <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="px-5">Batch</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right px-5">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-28 text-center text-xs text-muted-foreground italic">
                      No payroll batches processed yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentBatches.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs font-bold text-primary px-5">{b.batchId || b.id}</TableCell>
                      <TableCell className="text-xs font-medium">{b.period || '—'}</TableCell>
                      <TableCell className="text-right text-xs font-bold px-5">
                        {formatCurrency(b.totalAmount || 0, currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
