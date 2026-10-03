'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  TrendingUp,
  TrendingDown,
  Receipt,
  AlertTriangle,
  Clock,
  CheckCircle2,
  DollarSign,
  PieChart,
  ShieldAlert,
  Calendar,
  ExternalLink,
  Plus,
  FileText,
  UserCog,
  Search,
  Loader2
} from "lucide-react";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, doc, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { downloadStaffContributionTemplate } from '@/lib/excel-template';
import { cn } from '@/lib/utils';
import { format, isPast, differenceInDays } from 'date-fns';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { updateUserRoleAction } from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminDashboard() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';
  const { toast } = useToast();

  const currentUserRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore]);
  const { data: currentUserData } = useDoc(currentUserRef);
  const currentRole = currentUserData?.role || 'admin';
  const isSuperAdmin = currentRole === 'admin';
  const isAccountant = currentRole === 'accountant';

  // Role Assignment State
  const [roleModalMember, setRoleModalMember] = useState<any | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('member');
  const [roleJustification, setRoleJustification] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  const handleOpenRoleModal = (member: any) => {
    setRoleModalMember(member);
    setSelectedRole(member.role || 'member');
    setRoleJustification('');
  };

  const handleAssignRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalMember) return;

    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect and try again.",
      });
      return;
    }

    if (!roleJustification.trim()) {
      toast({
        variant: "destructive",
        title: "Justification Required",
        description: "Please enter an audit reason or justification for changing this member's system role.",
      });
      return;
    }

    setIsUpdatingRole(true);
    try {
      await updateUserRoleAction(roleModalMember.id, selectedRole, roleJustification.trim());
      toast({
        title: "Role Updated Successfully",
        description: `${roleModalMember.name || roleModalMember.email} has been assigned the "${selectedRole.toUpperCase()}" role.`,
      });
      setRoleModalMember(null);
      setRoleJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Failed to Assign Role",
        description: parsed.message,
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // 1. Subscriptions
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

  const repaymentsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'repayments'));
  }, [firestore]);
  const { data: repaymentsSnap } = useCollection(repaymentsQuery);

  const expensesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'expenses'), orderBy('createdAt', 'desc'));
  }, [firestore]);
  const { data: expensesSnap } = useCollection(expensesQuery);

  const batchesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contribution_batches'), orderBy('createdAt', 'desc'), limit(5));
  }, [firestore]);
  const { data: batchesSnap } = useCollection(batchesQuery);

  // 2. Parsed entities
  const users = useMemo(() => usersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [usersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);
  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const repayments = useMemo(() => repaymentsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [repaymentsSnap]);
  const expenses = useMemo(() => expensesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [expensesSnap]);
  const recentBatches = useMemo(() => batchesSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [batchesSnap]);

  // Member map helper
  const memberMap = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u: any) => map.set(u.id, u));
    return map;
  }, [users]);

  // 3. Core Financial Calculations
  // A. Total Verified Contributions (Savings Pot)
  const totalVerifiedSavings = useMemo(() => {
    return contributions
      .filter((c: any) => c.status === 'verified')
      .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
  }, [contributions]);

  // B. Operating Expenses: Approved (Subtracted from Assets) vs Pending
  const approvedExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'approved'), [expenses]);
  const pendingExpenses = useMemo(() => expenses.filter((e: any) => e.status === 'pending'), [expenses]);

  const totalApprovedExpenses = useMemo(() => {
    return approvedExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }, [approvedExpenses]);

  const totalPendingExpenses = useMemo(() => {
    return pendingExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  }, [pendingExpenses]);

  // C. Total Loan Amount (Disbursed capital & Outstanding active balance)
  const approvedLoans = useMemo(() => {
    return loans.filter((l: any) => l.status === 'approved' || l.status === 'completed' || l.status === 'active');
  }, [loans]);

  const totalLoanAmountDisbursed = useMemo(() => {
    return approvedLoans.reduce((sum: number, l: any) => sum + (Number(l.amount) || 0), 0);
  }, [approvedLoans]);

  const totalActivePrincipalBalance = useMemo(() => {
    return loans
      .filter((l: any) => l.status === 'approved' && (Number(l.balance) || 0) > 0)
      .reduce((sum: number, l: any) => sum + (Number(l.balance) || 0), 0);
  }, [loans]);

  // D. Total Interests (Earned from loans + Member accrued interest)
  const totalLoanInterests = useMemo(() => {
    return approvedLoans.reduce((sum: number, l: any) => sum + (Number(l.interestAmount) || 0), 0);
  }, [approvedLoans]);

  const totalMemberAccruedInterest = useMemo(() => {
    return users.reduce((sum: number, u: any) => sum + (Number(u.accruedInterest) || 0), 0);
  }, [users]);

  // Verified Repayments collected
  const totalVerifiedRepayments = useMemo(() => {
    return repayments
      .filter((r: any) => r.status === 'verified')
      .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
  }, [repayments]);

  // E. Total Arrears Amount (Missed & Overdue Installments)
  const { totalArrearsAmount, arrearsList } = useMemo(() => {
    let arrearsSum = 0;
    const list: any[] = [];

    loans.forEach((loan: any) => {
      if (loan.status === 'approved' && Array.isArray(loan.amortization)) {
        loan.amortization.forEach((inst: any) => {
          const rawDate = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
          if (inst.status === 'pending' && isPast(rawDate)) {
            const instAmount = Number(inst.amount) || 0;
            arrearsSum += instAmount;
            const daysOverdue = differenceInDays(new Date(), rawDate);
            list.push({
              loanId: loan.id,
              memberId: loan.memberId,
              memberName: memberMap.get(loan.memberId)?.name || 'Member',
              memberEmail: memberMap.get(loan.memberId)?.email || '',
              installmentNumber: inst.installmentNumber,
              dueDate: rawDate,
              daysOverdue,
              amount: instAmount,
              loanDescription: loan.description
            });
          }
        });
      }
    });

    list.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return { totalArrearsAmount: arrearsSum, arrearsList: list };
  }, [loans, memberMap]);

  // F. Total Members
  const totalMembersCount = users.length;
  const regularMembersCount = users.filter((u: any) => !u.role || u.role === 'member').length;
  const staffOfficersCount = users.filter((u: any) => u.role && u.role !== 'member').length;

  // G. TOTAL ASSET AMOUNT (Authoritatively Subtracted by Approved Expenses)
  // Gross Institutional Capital = Verified Savings + Total Realized Loan Interest
  // Net Total Assets = Gross Capital - Total Approved Expenses
  const grossCapital = totalVerifiedSavings + totalLoanInterests;
  const totalAssetAmount = Math.max(0, grossCapital - totalApprovedExpenses);

  // Group Lending Pool Ceiling Metrics (% of Total Net Assets)
  const maxLendingPoolPercentage = Number(settings.maxLendingPoolPercentage) || 90;
  const maxLendingPoolAllowed = Math.round((totalAssetAmount * maxLendingPoolPercentage) / 100);
  const availableLendingPool = Math.max(0, maxLendingPoolAllowed - totalActivePrincipalBalance);
  const lendingPoolUtilizationRatio = maxLendingPoolAllowed > 0 
    ? Math.min(100, Math.round((totalActivePrincipalBalance / maxLendingPoolAllowed) * 100))
    : 0;

  // Liquid Cash Reserve = (Verified Savings + Verified Repayments) - (Disbursed Loans + Approved Expenses)
  const liquidCashReserve = Math.max(0, (totalVerifiedSavings + totalVerifiedRepayments) - (totalLoanAmountDisbursed + totalApprovedExpenses));

  // Filtered members for role assignment
  const filteredStaffMembers = useMemo(() => {
    return users.filter((u: any) => {
      const term = memberSearchTerm.toLowerCase();
      return (
        !term ||
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.role && u.role.toLowerCase().includes(term))
      );
    });
  }, [users, memberSearchTerm]);

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-16">
      {/* Executive Welcome & Control Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              Executive Institutional Console
            </Badge>
            {pendingExpenses.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-bold">
                {pendingExpenses.length} Expense{pendingExpenses.length > 1 ? 's' : ''} Pending Sign-Off
              </Badge>
            )}
          </div>
          <h1 className="text-[13px] font-bold font-headline tracking-tight text-foreground">Institutional Financial Overview</h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            Authoritative balance sheet, operating expenses audit, credit risk portfolio, and staff scheme management.
          </p>
        </div>

        {/* Global Action CTAs */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button asChild variant="outline" className="rounded-xl font-bold text-[12px] gap-2 h-10 px-3.5 shadow-sm border-primary/20 hover:bg-primary/5 flex-1 sm:flex-none">
            <Link href="/admin/expenses">
              <Receipt className="h-4 w-4 text-primary" /> Operating Expenses Hub
            </Link>
          </Button>

          {isAccountant ? (
            <Button asChild className="rounded-xl font-bold text-[12px] gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground flex-1 sm:flex-none">
              <Link href="/admin/contributions">
                <Upload className="h-4 w-4" /> Upload in Batches
              </Link>
            </Button>
          ) : isSuperAdmin ? (
            <Button asChild className="rounded-xl font-bold text-[12px] gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground flex-1 sm:flex-none">
              <Link href="/admin/contributions">
                <ShieldCheck className="h-4 w-4" /> Batch Approvals &amp; Ledger
              </Link>
            </Button>
          ) : (
            <Button asChild className="rounded-xl font-bold text-[12px] gap-2 shadow-sm h-10 px-4 bg-primary text-primary-foreground flex-1 sm:flex-none">
              <Link href="/admin/contributions">
                <FileSpreadsheet className="h-4 w-4" /> Batch Review Queue
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* 6 TOP EXECUTIVE KPI CARDS */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. TOTAL ASSET AMOUNT (WITH EXPENSES SUBTRACTED) */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Institutional Balance
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Total Net Assets
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <Wallet className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {formatCurrency(totalAssetAmount, currency)}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Gross Capital:</span>
              <span className="font-semibold text-black font-mono">{formatCurrency(grossCapital, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium text-[11px]">Approved Expenses:</span>
              <span className="font-bold text-black font-mono">-{formatCurrency(totalApprovedExpenses, currency)}</span>
            </div>
          </CardContent>
        </Card>

        {/* 2. TOTAL LOAN AMOUNT */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Credit Facility
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Total Loan Portfolio
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <Landmark className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {formatCurrency(totalLoanAmountDisbursed, currency)}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Active Principal Outstanding:</span>
              <span className="font-bold text-black font-mono">{formatCurrency(totalActivePrincipalBalance, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">Disbursed Facilities:</span>
              <span className="font-semibold text-black">{approvedLoans.length} Loans</span>
            </div>
          </CardContent>
        </Card>

        {/* 3. TOTAL ARREARS AMOUNT */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Default Risk Watch
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Total Arrears Amount
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {formatCurrency(totalArrearsAmount, currency)}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Overdue Installments:</span>
              <Badge variant={totalArrearsAmount > 0 ? "destructive" : "outline"} className="text-[10px] font-bold h-5">
                {arrearsList.length} Missed
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">Portfolio Risk:</span>
              <span className="font-semibold text-[11px] text-black">
                {totalActivePrincipalBalance > 0 
                  ? `${Math.round((totalArrearsAmount / totalActivePrincipalBalance) * 100)}% of active debt` 
                  : '0%'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 4. TOTAL INTERESTS */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Revenue Generation
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Total Group Interest
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {formatCurrency(totalLoanInterests, currency)}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Accrued to Members:</span>
              <span className="font-semibold text-black font-mono">{formatCurrency(totalMemberAccruedInterest, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">Policy Rate:</span>
              <span className="font-semibold text-black">{settings.loanInterestRate || 10}% ({settings.interestModel || 'one-off'})</span>
            </div>
          </CardContent>
        </Card>

        {/* 5. TOTAL MEMBERS */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Scheme Participation
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Total Members
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {totalMembersCount}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Staff Participants:</span>
              <span className="font-semibold text-black">{regularMembersCount} Savers</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">Administrative Officers:</span>
              <span className="font-semibold text-black">{staffOfficersCount} Staff</span>
            </div>
          </CardContent>
        </Card>

        {/* 6. OPERATING EXPENSES (DEDUCTED FROM ASSETS) */}
        <Card className="shadow-sm border border-border bg-white rounded-[10px] overflow-hidden">
          <CardHeader className="bg-blue-600 text-white p-4 border-b border-blue-700/30 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
                Operational Outflows
              </span>
              <CardTitle className="text-base font-bold text-white mt-0.5">
                Operating Expenses
              </CardTitle>
            </div>
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <Receipt className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-5 bg-white space-y-2">
            <div className="text-3xl font-bold font-headline text-black font-mono">
              {formatCurrency(totalApprovedExpenses, currency)}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px]">Pending Approvals:</span>
              <Badge variant={pendingExpenses.length > 0 ? "secondary" : "outline"} className="text-[10px] font-bold">
                {pendingExpenses.length} Pending
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">Audited Vouchers:</span>
              <span className="font-semibold text-black">{approvedExpenses.length} Approved</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DETAILED INTERACTIVE MODULE TABS */}
      <Tabs defaultValue="balance-sheet" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="balance-sheet" className="gap-2">
            <PieChart className="h-3.5 w-3.5" />
            Asset Reconciliation
          </TabsTrigger>
          <TabsTrigger value="arrears-watchlist" className="gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Arrears Watchlist
            {arrearsList.length > 0 && (
              <Badge className="bg-destructive text-white font-mono text-[9px] h-4 min-w-4 px-1 rounded-full border-none">
                {arrearsList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expenses-ledger" className="gap-2">
            <Receipt className="h-3.5 w-3.5" />
            Operating Expenses
            {pendingExpenses.length > 0 && (
              <Badge className="bg-white/20 text-white font-mono text-[9px] h-4 min-w-4 px-1 rounded-full border-none">
                {pendingExpenses.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="source-deductions" className="gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Payroll Batches
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ASSET RECONCILIATION & BALANCE SHEET */}
        <TabsContent value="balance-sheet" className="space-y-6">
          <Card className="border border-border shadow-sm bg-white rounded-[10px] overflow-hidden">
            <CardHeader className="bg-blue-600 text-white p-5 border-b border-blue-700/30">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <PieChart className="h-5 w-5 text-white" />
                Institutional Balance Sheet &amp; Capital Reconciliation
              </CardTitle>
              <CardDescription className="text-blue-100 text-xs mt-0.5">
                Authoritative breakdown of group savings, interest revenues, operating expenses deductions, and net liquidity.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 bg-white">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Balance Sheet Ledger Table */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Capital Ledger Composition
                  </h4>
                  <div className="border border-border rounded-xl divide-y divide-border overflow-hidden text-sm bg-white">
                    {/* 1. Verified Savings */}
                    <div className="p-4 flex items-center justify-between bg-white hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 flex items-center justify-center font-bold text-xs">
                          (+)
                        </div>
                        <div>
                          <p className="font-bold text-foreground">Verified Member Savings</p>
                          <p className="text-[11px] text-muted-foreground">Total verified contributions deposited</p>
                        </div>
                      </div>
                      <span className="font-bold text-black font-mono">
                        +{formatCurrency(totalVerifiedSavings, currency)}
                      </span>
                    </div>

                    {/* 2. Realized Interest */}
                    <div className="p-4 flex items-center justify-between bg-white hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-green-600/10 text-green-700 dark:text-green-400 flex items-center justify-center font-bold text-xs">
                          (+)
                        </div>
                        <div>
                          <p className="font-bold text-foreground">Total Loan Interest &amp; Yield</p>
                          <p className="text-[11px] text-muted-foreground">Cumulative interest generated from loans</p>
                        </div>
                      </div>
                      <span className="font-bold text-black font-mono">
                        +{formatCurrency(totalLoanInterests, currency)}
                      </span>
                    </div>

                    {/* 3. Approved Operating Expenses (SUBTRACTED) */}
                    <div className="p-4 flex items-center justify-between bg-white hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-muted text-foreground flex items-center justify-center font-bold text-xs">
                          (-)
                        </div>
                        <div>
                          <p className="font-bold text-foreground">Approved Operating Expenses</p>
                          <p className="text-[11px] text-muted-foreground">Lodged by Accountant &amp; approved by Admin</p>
                        </div>
                      </div>
                      <span className="font-bold text-black font-mono">
                        -{formatCurrency(totalApprovedExpenses, currency)}
                      </span>
                    </div>

                    {/* TOTAL NET ASSET RESULT */}
                    <div className="p-4 flex items-center justify-between bg-slate-50 font-bold border-t-2 border-border">
                      <div>
                        <p className="text-base font-bold text-foreground">Total Net Institutional Assets</p>
                        <p className="text-[11px] text-muted-foreground font-normal">
                          Savings + Interest - Approved Operating Expenses
                        </p>
                      </div>
                      <span className="text-xl font-headline font-bold text-black font-mono">
                        {formatCurrency(totalAssetAmount, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Liquidity & Credit Risk Health */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Liquidity &amp; Risk Distribution
                  </h4>
                  <div className="grid gap-3">
                    <div className="p-4 rounded-xl bg-white border border-border shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                          Estimated Cash in Bank / Net Liquidity
                        </span>
                        <p className="text-xl font-bold font-headline text-black mt-0.5 font-mono">
                          {formatCurrency(liquidCashReserve, currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Savings + Repayments - Disbursed Loans - Expenses
                        </p>
                      </div>
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                        Liquid
                      </Badge>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-border shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                          Active Loan Principal Outstanding
                        </span>
                        <p className="text-xl font-bold font-headline text-black mt-0.5 font-mono">
                          {formatCurrency(totalActivePrincipalBalance, currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Performing assets owed by members
                        </p>
                      </div>
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                        Earning
                      </Badge>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-border shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                          Borrowing Multiplier Policy
                        </span>
                        <p className="text-xl font-bold font-headline text-black mt-0.5 font-mono">
                          {settings.maxLoanPercentage || 200}%
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Max loan entitlement per unit of savings
                        </p>
                      </div>
                      <Button asChild size="sm" variant="ghost" className="h-8 text-xs font-bold text-primary">
                        <Link href="/admin/settings">Configure →</Link>
                      </Button>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-border shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                          <Landmark className="h-3 w-3 text-blue-600" /> Lending Pool Ceiling ({maxLendingPoolPercentage}% of Assets)
                        </span>
                        <p className="text-xl font-bold font-headline text-black font-mono">
                          {formatCurrency(availableLendingPool, currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatCurrency(totalActivePrincipalBalance, currency)} active of {formatCurrency(maxLendingPoolAllowed, currency)} max loan pool ({lendingPoolUtilizationRatio}% used)
                        </p>
                      </div>
                      <Badge className={availableLendingPool > 0 ? "bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold" : "bg-destructive text-white text-[10px] font-bold"}>
                        {availableLendingPool > 0 ? 'Liquidity Open' : 'Ceiling Reached'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: ARREARS WATCHLIST */}
        <TabsContent value="arrears-watchlist" className="space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Contractual Arrears &amp; Delinquency Watchlist
                </CardTitle>
                <CardDescription>
                  Unpaid installments whose contractual due dates have lapsed without full settlement.
                </CardDescription>
              </div>
              <Badge variant={arrearsList.length > 0 ? "destructive" : "outline"} className="text-xs font-bold px-3 py-1">
                Total Arrears: {formatCurrency(totalArrearsAmount, currency)}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[11px] uppercase">Borrower</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Facility / Note</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Installment</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Contract Due Date</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Days Overdue</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase text-right">Overdue Arrears</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrearsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic font-medium">
                        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-80" />
                        Exceptional portfolio performance! There are currently zero installments in arrears.
                      </TableCell>
                    </TableRow>
                  ) : (
                    arrearsList.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-destructive/5 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{item.memberName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.memberEmail}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground truncate max-w-[180px]">
                            {item.loanDescription || 'Capital Facility'}
                          </p>
                          <span className="font-mono text-[9px] text-muted-foreground">ID: {item.loanId.slice(0, 8)}</span>
                        </TableCell>
                        <TableCell className="font-bold text-xs">
                          #{item.installmentNumber}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-destructive">
                          {format(item.dueDate, 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            {item.daysOverdue} days late
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm text-destructive">
                          {formatCurrency(item.amount, currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: OPERATING EXPENSES HUB OVERVIEW */}
        <TabsContent value="expenses-ledger" className="space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  Recent Operational Expenses &amp; Deductions
                </CardTitle>
                <CardDescription>
                  Accountant-lodged expenses and admin-approved asset deductions.
                </CardDescription>
              </div>
              <Button asChild size="sm" className="rounded-xl font-bold text-xs gap-1.5 shadow-sm">
                <Link href="/admin/expenses">
                  Manage All Expenses <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[11px] uppercase">Title / Payee</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Category</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Amount</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Date</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase">Receipt Proof</TableHead>
                    <TableHead className="font-bold text-[11px] uppercase text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                        No expenses lodged yet. Click &ldquo;Manage All Expenses&rdquo; to lodge.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.slice(0, 6).map((exp: any) => (
                      <TableRow key={exp.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{exp.title}</p>
                          <p className="text-[10px] text-muted-foreground">Lodged by: {exp.lodgedByName || 'Accountant'}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {exp.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-sm text-foreground">
                          {formatCurrency(exp.amount, currency)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {exp.expenseDate}
                        </TableCell>
                        <TableCell>
                          {exp.receiptUrl ? (
                            <Button variant="ghost" size="sm" asChild className="h-7 text-xs font-bold gap-1 text-primary">
                              <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3 w-3" /> Proof <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            className={cn(
                              "text-[10px] uppercase font-bold",
                              exp.status === 'approved' && "bg-green-500/10 text-green-700 dark:text-green-400 border-none",
                              exp.status === 'pending' && "bg-primary/10 text-primary border-none",
                              exp.status === 'rejected' && "bg-destructive/10 text-destructive border-none"
                            )}
                          >
                            {exp.status === 'approved' ? 'Deducted' : exp.status}
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

        {/* TAB 4: SOURCE DEDUCTIONS & PAYROLL BATCHES */}
        <TabsContent value="source-deductions" className="space-y-6">
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
            {/* Registered Staff Members with Quick Role Assignment */}
            <Card className="shadow-sm border border-border">
              <CardHeader className="flex flex-col gap-2 pb-3">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <UserCog className="h-4 w-4 text-primary" /> Registered Staff Members
                    </CardTitle>
                    <CardDescription>Scheme participants and system roles ({users.length})</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs font-bold text-primary">
                    <Link href="/members">
                      Full Directory <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    placeholder="Search by name, email, or role..." 
                    value={memberSearchTerm}
                    onChange={(e) => setMemberSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg bg-muted border-none"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4 text-[11px] uppercase">Member</TableHead>
                      <TableHead className="text-center text-[11px] uppercase">Current Role</TableHead>
                      <TableHead className="text-right px-4 text-[11px] uppercase">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaffMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-xs text-muted-foreground italic">
                          No members matching &ldquo;{memberSearchTerm}&rdquo; found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStaffMembers.slice(0, 6).map((u: any) => (
                        <TableRow key={u.id} className="hover:bg-muted/20">
                          <TableCell className="px-4 py-2.5">
                            <p className="font-bold text-xs text-foreground">{u.name || 'Member'}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{u.email}</p>
                          </TableCell>
                          <TableCell className="text-center py-2.5">
                            <Badge 
                              variant="secondary" 
                              className={cn(
                                "text-[9px] uppercase font-bold border-none",
                                u.role === 'admin' && "bg-primary/10 text-primary",
                                u.role === 'accountant' && "bg-blue-500/10 text-blue-600",
                                u.role === 'management' && "bg-foreground/10 text-foreground",
                                u.role === 'reviewer' && "bg-green-600/10 text-green-700 dark:text-green-400",
                                (!u.role || u.role === 'member') && "bg-muted text-muted-foreground"
                              )}
                            >
                              {u.role || 'member'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right px-4 py-2.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenRoleModal(u)}
                              className="h-7 px-2.5 text-[11px] font-bold rounded-lg border-primary/20 text-primary hover:bg-primary/10 gap-1"
                            >
                              <UserCog className="h-3 w-3" /> Assign Role
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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
                  <TableHeader>
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
        </TabsContent>
      </Tabs>

      {/* ASSIGN ROLE MODAL DIALOG */}
      <Dialog open={Boolean(roleModalMember)} onOpenChange={(open) => !open && setRoleModalMember(null)}>
        <DialogContent className="sm:max-w-[500px] rounded-[10px]">
          <form onSubmit={handleAssignRoleSubmit}>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary mb-1">
                <UserCog className="h-5 w-5" />
                <DialogTitle className="text-lg font-bold">Assign Member System Role</DialogTitle>
              </div>
              <DialogDescription>
                Configure administrative privileges and operational responsibilities for this member.
              </DialogDescription>
            </DialogHeader>

            {roleModalMember && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-muted rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-foreground">{roleModalMember.name || 'Member'}</p>
                    <p className="text-xs text-muted-foreground">{roleModalMember.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    Current: {roleModalMember.role || 'member'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">Select New System Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none font-bold">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">General Member (Savings &amp; Standard Loans)</SelectItem>
                      <SelectItem value="accountant">Accountant (Operating Expenses &amp; Payroll Uploads)</SelectItem>
                      <SelectItem value="reviewer">Reviewer (Audit Trail &amp; Compliance Sign-Off)</SelectItem>
                      <SelectItem value="management">Management (Loan Approvals &amp; Credit Decisions)</SelectItem>
                      <SelectItem value="admin">Administrator (Full Institutional System Control)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Role Guidance Card */}
                <div className="p-3 rounded-lg border text-xs space-y-1 bg-muted/40">
                  <p className="font-bold text-foreground">
                    {selectedRole === 'admin' && 'Administrator Authority'}
                    {selectedRole === 'accountant' && 'Accountant Privileges'}
                    {selectedRole === 'management' && 'Management Authority'}
                    {selectedRole === 'reviewer' && 'Reviewer & Auditor Privileges'}
                    {selectedRole === 'member' && 'General Member Privileges'}
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {selectedRole === 'admin' && 'Grants comprehensive access to all financial settings, user roles, interest distribution, expense sign-off, and database resets.'}
                    {selectedRole === 'accountant' && 'Allows lodging operating expense receipts, uploading bulk payroll spreadsheets, and managing contribution records.'}
                    {selectedRole === 'management' && 'Authorizes approving member loan facilities, reviewing top-up requests, and auditing liquidity limits.'}
                    {selectedRole === 'reviewer' && 'Grants read-only auditing access across institutional ledgers, arrears watchlists, and compliance logs.'}
                    {selectedRole === 'member' && 'Standard participant with access to personal savings, loan requests, repayment schedules, and announcements.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">
                    Audit Justification / Reason <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={roleJustification}
                    onChange={(e) => setRoleJustification(e.target.value)}
                    placeholder="Enter reason for role assignment (e.g., Appointed Scheme Treasurer / Promoted to Credit Committee)..."
                    required
                    className="min-h-[80px] rounded-[10px] bg-muted border-none text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    * This action will be permanently recorded in the immutable administrative audit log.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoleModalMember(null)}
                disabled={isUpdatingRole}
                className="rounded-[10px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUpdatingRole || !roleJustification.trim()}
                className="rounded-[10px] font-bold gap-2"
              >
                {isUpdatingRole ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Assigning Role...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" /> Confirm Role Assignment
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
