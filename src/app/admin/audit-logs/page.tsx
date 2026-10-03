'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  ShieldCheck, 
  Search, 
  Download, 
  FileText, 
  Calendar, 
  Filter, 
  RotateCcw, 
  Eye, 
  ShieldAlert, 
  Loader2, 
  Clock, 
  UserCheck, 
  CheckCircle2, 
  ArrowLeft,
  Lock,
  Receipt,
  Wallet,
  Landmark,
  UserCog,
  Database
} from "lucide-react";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { format, isToday, isWithinInterval, subDays, startOfYear, endOfYear } from 'date-fns';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Friendly action labels and categorization
const ACTION_CONFIG: Record<string, { label: string; category: string; badgeColor: string }> = {
  // Members & Roles
  'REGISTER_MEMBER': { label: 'Register Member', category: 'members', badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' },
  'BULK_REGISTER_MEMBERS': { label: 'Bulk Register Members', category: 'members', badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' },
  'UPDATE_USER_ROLE': { label: 'Update Role', category: 'members', badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' },
  'UPDATE_MEMBER_STATUS': { label: 'Update Status', category: 'members', badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  'DELETE_MEMBER': { label: 'Revoke Member Access', category: 'members', badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },

  // Operating Expenses
  'LODGE_EXPENSE': { label: 'Lodge Expense Voucher', category: 'expenses', badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  'APPROVE_EXPENSE': { label: 'Approve Expense Voucher', category: 'expenses', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  'REJECT_EXPENSE': { label: 'Reject Expense Voucher', category: 'expenses', badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },

  // Contributions & Batches
  'UPLOAD_CONTRIBUTION_BATCH': { label: 'Upload Contribution Batch', category: 'contributions', badgeColor: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  'REVIEW_CONTRIBUTION_BATCH': { label: 'Review Batch (Endorse)', category: 'contributions', badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-400' },
  'APPROVE_CONTRIBUTION_BATCH': { label: 'Final Batch Approval', category: 'contributions', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  'REJECT_CONTRIBUTION_BATCH': { label: 'Reject Batch', category: 'contributions', badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
  'RECORD_CONTRIBUTION': { label: 'Record Contribution', category: 'contributions', badgeColor: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  'VERIFY_CONTRIBUTION': { label: 'Verify Contribution', category: 'contributions', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  'REVERSE_CONTRIBUTION': { label: 'Reverse Contribution', category: 'contributions', badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },

  // Loans & Repayments
  'APPROVE_LOAN': { label: 'Approve Loan Facility', category: 'loans', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  'REJECT_LOAN': { label: 'Reject Loan Facility', category: 'loans', badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
  'RECORD_REPAYMENT': { label: 'Record Loan Repayment', category: 'loans', badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  'VERIFY_REPAYMENT': { label: 'Verify Loan Repayment', category: 'loans', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },

  // Financial Policy & Distributions
  'UPDATE_FINANCIAL_SETTINGS': { label: 'Update Financial Policy', category: 'finance', badgeColor: 'bg-violet-500/10 text-violet-700 dark:text-violet-400' },
  'ALLOCATE_INTEREST': { label: 'Distribute Interest Profit', category: 'finance', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  'RESET_FINANCIAL_DATA': { label: 'Institutional Database Reset', category: 'finance', badgeColor: 'bg-red-500/10 text-red-700 dark:text-red-400' },
};

export default function AuditLogsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const role = userData?.role || 'member';
  const isAuthorized = ['admin', 'auditor', 'reviewer', 'management', 'accountant'].includes(role);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Firestore Queries: strictly read-only
  const auditLogsQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc'));
  }, [isAuthorized]);

  const usersQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return collection(firestore, 'users');
  }, [isAuthorized]);

  const { data: auditLogsSnap, loading: logsLoading } = useCollection(auditLogsQuery);
  const { data: usersSnap } = useCollection(usersQuery);

  // Map users by ID for quick actor name / email lookup
  const userMap = useMemo(() => {
    const map = new Map<string, any>();
    usersSnap?.docs.forEach(d => {
      map.set(d.id, { id: d.id, ...d.data() });
    });
    return map;
  }, [usersSnap]);

  // Normalize raw logs
  const logs = useMemo(() => {
    if (!auditLogsSnap) return [];
    return auditLogsSnap.docs.map(d => {
      const data = d.data();
      const actorId = data.adminId || data.performedBy || data.userId || '';
      const actorUser = userMap.get(actorId);

      const actorName = data.performedByName || actorUser?.name || actorUser?.email || data.adminEmail || 'Authorized Staff';
      const actorEmail = actorUser?.email || data.adminEmail || (actorId ? `UID: ${actorId.slice(0, 6)}...` : 'System');
      const actorRole = data.performedByRole || actorUser?.role || (data.adminId ? 'admin' : 'staff');

      let dateObj: Date | null = null;
      if (data.timestamp instanceof Timestamp) {
        dateObj = data.timestamp.toDate();
      } else if (data.timestamp) {
        dateObj = new Date(data.timestamp);
      }

      const config = ACTION_CONFIG[data.action] || {
        label: data.action?.replace(/_/g, ' ') || 'System Action',
        category: 'other',
        badgeColor: 'bg-muted text-muted-foreground'
      };

      return {
        id: d.id,
        raw: data,
        action: data.action,
        actionLabel: config.label,
        category: config.category,
        badgeColor: config.badgeColor,
        actorId,
        actorName,
        actorEmail,
        actorRole,
        justification: data.justification || data.details?.justification || data.details?.reason || data.details?.notes || '—',
        details: data.details || {},
        dateObj,
        timestampFormatted: dateObj ? format(dateObj, 'MMM d, yyyy HH:mm:ss') : 'Pending Commit',
        dateShort: dateObj ? format(dateObj, 'MMM d, yyyy') : '—',
        timeShort: dateObj ? format(dateObj, 'p') : '—',
        ipAddress: data.ipAddress || 'Internal'
      };
    });
  }, [auditLogsSnap, userMap]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    const now = new Date();
    return logs.filter(log => {
      // 1. Text Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesAction = log.actionLabel.toLowerCase().includes(term) || log.action?.toLowerCase().includes(term);
        const matchesActor = log.actorName.toLowerCase().includes(term) || log.actorEmail.toLowerCase().includes(term);
        const matchesJustification = log.justification.toLowerCase().includes(term);
        const matchesDetails = JSON.stringify(log.details).toLowerCase().includes(term);
        if (!matchesAction && !matchesActor && !matchesJustification && !matchesDetails) {
          return false;
        }
      }

      // 2. Role Filter
      if (selectedRole !== 'all') {
        if (log.actorRole?.toLowerCase() !== selectedRole.toLowerCase()) {
          return false;
        }
      }

      // 3. Category Filter
      if (selectedCategory !== 'all') {
        if (log.category !== selectedCategory) {
          return false;
        }
      }

      // 4. Period Filter
      if (selectedPeriod !== 'all' && log.dateObj) {
        if (selectedPeriod === 'today') {
          if (!isToday(log.dateObj)) return false;
        } else if (selectedPeriod === '7days') {
          if (log.dateObj < subDays(now, 7)) return false;
        } else if (selectedPeriod === '30days') {
          if (log.dateObj < subDays(now, 30)) return false;
        } else if (selectedPeriod === 'thisYear') {
          const interval = { start: startOfYear(now), end: endOfYear(now) };
          if (!isWithinInterval(log.dateObj, interval)) return false;
        }
      }

      return true;
    });
  }, [logs, searchTerm, selectedRole, selectedCategory, selectedPeriod]);

  // KPI Computations
  const stats = useMemo(() => {
    const total = logs.length;
    const adminDirectives = logs.filter(l => ['UPDATE_USER_ROLE', 'UPDATE_FINANCIAL_SETTINGS', 'ALLOCATE_INTEREST', 'RESET_FINANCIAL_DATA', 'REGISTER_MEMBER'].includes(l.action)).length;
    const expenses = logs.filter(l => l.category === 'expenses').length;
    const contributionsAndLoans = logs.filter(l => l.category === 'contributions' || l.category === 'loans').length;
    return { total, adminDirectives, expenses, contributionsAndLoans };
  }, [logs]);

  // Extract a readable summary string from the `details` object
  const formatDetailsSummary = (log: any) => {
    const d = log.details;
    if (!d || Object.keys(d).length === 0) return 'Standard system execution';
    
    if (log.action === 'LODGE_EXPENSE' || log.action === 'APPROVE_EXPENSE' || log.action === 'REJECT_EXPENSE') {
      const amount = d.amount ? formatCurrency(d.amount, currency) : '';
      return `${d.title || d.expenseId || 'Expense'} ${amount ? `(${amount})` : ''} - ${d.category || ''}`;
    }
    if (log.action === 'UPDATE_USER_ROLE') {
      return `Target Member: ${d.targetUserId?.slice(0, 8)}... → New Role: ${d.role?.toUpperCase()}`;
    }
    if (log.action === 'ALLOCATE_INTEREST') {
      return `Total Profit Distributed: ${formatCurrency(d.totalDistributed || 0, currency)} to ${d.memberDistributions?.length || 'all'} members`;
    }
    if (log.action === 'APPROVE_LOAN' || log.action === 'REJECT_LOAN') {
      return `Loan: ${d.loanId || 'Facility'} ${d.amount ? `(${formatCurrency(d.amount, currency)})` : ''}`;
    }
    if (log.action?.includes('BATCH')) {
      return `Batch: ${d.batchId || d.id || 'Upload'} ${d.count ? `(${d.count} records)` : ''}`;
    }
    if (log.action === 'REGISTER_MEMBER') {
      return `New Member: ${d.email || d.memberId || 'Registered'}`;
    }
    if (log.action === 'BULK_REGISTER_MEMBERS') {
      return `Bulk Created: ${d.count || 0} participants`;
    }

    // Default: key-values
    const entries = Object.entries(d).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? '...' : String(v)}`);
    return entries.join(' | ');
  };

  // Generate Official PDF Report
  const handleExportPdf = () => {
    try {
      setIsGeneratingPdf(true);
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const primaryColor: [number, number, number] = [37, 99, 235]; // #2563EB Blue
      const darkColor: [number, number, number] = [15, 23, 42]; // Slate 900
      const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500

      // Title & Organization Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 297, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text("IKIMINA COOPERATIVE SCHEME — OFFICIAL REGULATORY AUDIT TRAIL", 14, 11);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text("Comprehensive Institutional Action Ledger — Strictly Tamper-Evident & Immutable", 14, 18);

      // Metadata Block
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text("AUDIT GENERATION METADATA", 14, 32);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Generated At: ${format(new Date(), 'EEEE, MMMM d, yyyy HH:mm:ss')}`, 14, 38);
      doc.text(`Auditor / Generated By: ${userData?.name || user?.email || 'Authorized Auditor'} (Role: ${role.toUpperCase()})`, 14, 43);
      doc.text(`Active Filter Scope: Role: ${selectedRole.toUpperCase()} | Category: ${selectedCategory.toUpperCase()} | Period: ${selectedPeriod.toUpperCase()}`, 14, 48);

      // Summary KPI Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(175, 28, 108, 23, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("AUDIT LEDGER RECONCILIATION SUMMARY", 179, 34);

      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Ledger Entries in Query: ${filteredLogs.length} of ${logs.length}`, 179, 40);
      doc.text(`Administrative Directives: ${stats.adminDirectives} | Expense Vouchers: ${stats.expenses}`, 179, 44);
      doc.text(`Data Integrity: 100% Immutable (Client Mutations Prohibited)`, 179, 48);

      // Table Data Construction
      const tableData = filteredLogs.map((log, index) => [
        (index + 1).toString(),
        log.timestampFormatted,
        `${log.actorName}\n(${log.actorRole.toUpperCase()})`,
        log.actionLabel,
        formatDetailsSummary(log),
        log.justification
      ]);

      autoTable(doc, {
        startY: 55,
        head: [['#', 'Timestamp', 'Actor & Role', 'Action Executed', 'Operation Details / Scope', 'Audit Justification']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'left',
          valign: 'middle'
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [30, 41, 59],
          valign: 'top',
          cellPadding: 2.5
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 36 },
          2: { cellWidth: 42 },
          3: { cellWidth: 45 },
          4: { cellWidth: 70 },
          5: { cellWidth: 66 }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 14, right: 14, bottom: 20 },
        didDrawPage: (data) => {
          // Footer
          const pageCount = (doc as any).internal.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
          doc.text(
            `CONFIDENTIAL & PROPRIETARY — Official regulatory audit document generated from immutable server logs. Page ${data.pageNumber} of ${pageCount}`,
            14,
            202
          );
        }
      });

      const fileName = `ikimina_audit_report_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;
      doc.save(fileName);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate audit report PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (userLoading || (isAuthorized && logsLoading)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm font-bold text-muted-foreground">Loading Immutable Audit Logs...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-14 w-14 text-destructive" />
        <h2 className="text-2xl font-bold font-headline text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Only administrators, designated auditors, reviewers, and accountants have permission to access institutional audit trails.
        </p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/">Return to Member Portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header and Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-blue-600/10 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold font-headline text-foreground">
              Institutional Audit Trail &amp; Compliance
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Authoritative, tamper-evident log of every administrative, accounting, and credit directive.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={handleExportPdf}
            disabled={isGeneratingPdf || filteredLogs.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md h-10 px-4 text-xs sm:text-sm gap-2"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Official Audit PDF ({filteredLogs.length})
          </Button>

          <Button asChild variant="outline" className="rounded-xl h-10 text-xs sm:text-sm font-semibold">
            <Link href="/reports">
              <FileText className="h-4 w-4 mr-2" /> Financial Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl shadow-sm border border-border overflow-hidden">
          <CardHeader className="bg-blue-600 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Total Audit Logs</span>
              <Database className="h-4 w-4 text-blue-100" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-extrabold text-foreground">{stats.total}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Logged actions in permanent ledger</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-border overflow-hidden">
          <CardHeader className="bg-blue-600 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Admin Directives</span>
              <UserCog className="h-4 w-4 text-blue-100" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-extrabold text-foreground">{stats.adminDirectives}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Roles, policies, &amp; profit splits</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-border overflow-hidden">
          <CardHeader className="bg-blue-600 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Expense Operations</span>
              <Receipt className="h-4 w-4 text-blue-100" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-extrabold text-foreground">{stats.expenses}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Lodged, approved, &amp; rejected vouchers</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-border overflow-hidden">
          <CardHeader className="bg-blue-600 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Ledger Security</span>
              <Lock className="h-4 w-4 text-blue-100" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-base font-extrabold text-emerald-600 flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Read-Only &amp; Immutable
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Client write/delete operations prohibited</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="rounded-xl shadow-sm border border-border p-4 bg-card">
        <div className="grid gap-3 md:grid-cols-4">
          {/* Search Box */}
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actor, action, reason, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-muted/50 border-border text-xs"
            />
          </div>

          {/* Actor Role Filter */}
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border text-xs font-medium">
              <SelectValue placeholder="Actor Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="auditor">Auditor</SelectItem>
              <SelectItem value="accountant">Accountant</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
              <SelectItem value="management">Management</SelectItem>
            </SelectContent>
          </Select>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border text-xs font-medium">
              <SelectValue placeholder="Action Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Action Categories</SelectItem>
              <SelectItem value="members">Members &amp; Roles</SelectItem>
              <SelectItem value="expenses">Operating Expenses</SelectItem>
              <SelectItem value="contributions">Contributions &amp; Batches</SelectItem>
              <SelectItem value="loans">Loans &amp; Repayments</SelectItem>
              <SelectItem value="finance">System Policy &amp; Profits</SelectItem>
            </SelectContent>
          </Select>

          {/* Period Filter */}
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border text-xs font-medium">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recorded History</SelectItem>
              <SelectItem value="today">Today Only</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="thisYear">This Calendar Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active Filters Bar */}
        {(searchTerm || selectedRole !== 'all' || selectedCategory !== 'all' || selectedPeriod !== 'all') && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-border text-xs text-muted-foreground">
            <span>
              Showing <strong>{filteredLogs.length}</strong> matching events of {logs.length} total.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setSelectedRole('all');
                setSelectedCategory('all');
                setSelectedPeriod('all');
              }}
              className="h-7 text-xs text-primary font-bold hover:bg-primary/10 gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Main Audit Trail Table */}
      <Card className="rounded-2xl shadow-md border-none overflow-hidden bg-card">
        <CardHeader className="bg-blue-600 text-white p-5 border-b border-blue-700/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Immutable Institutional Audit Ledger
              </CardTitle>
              <CardDescription className="text-blue-100 text-xs mt-0.5">
                Permanently preserved actions recorded with server timestamp and digital identity verification.
              </CardDescription>
            </div>
            <Badge variant="outline" className="self-start sm:self-auto bg-white/10 text-white border-white/20 font-mono text-xs">
              {filteredLogs.length} Records
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="py-3.5 px-4 font-bold text-xs uppercase text-muted-foreground w-[160px]">Timestamp</TableHead>
                  <TableHead className="py-3.5 px-4 font-bold text-xs uppercase text-muted-foreground w-[180px]">Actor &amp; Role</TableHead>
                  <TableHead className="py-3.5 px-4 font-bold text-xs uppercase text-muted-foreground w-[190px]">Action Executed</TableHead>
                  <TableHead className="py-3.5 px-4 font-bold text-xs uppercase text-muted-foreground">Operation Scope / Target</TableHead>
                  <TableHead className="py-3.5 px-4 font-bold text-xs uppercase text-muted-foreground w-[220px]">Audit Reason / Note</TableHead>
                  <TableHead className="py-3.5 px-4 text-right font-bold text-xs uppercase text-muted-foreground w-[90px]">Inspect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-44 text-center text-muted-foreground italic">
                      No audit log records found matching the active search or filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                      {/* Timestamp */}
                      <TableCell className="py-3 px-4">
                        <div className="font-semibold text-xs text-foreground whitespace-nowrap">{log.dateShort}</div>
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" /> {log.timeShort}
                        </div>
                      </TableCell>

                      {/* Actor & Role */}
                      <TableCell className="py-3 px-4">
                        <div className="font-bold text-xs text-foreground truncate max-w-[160px]">{log.actorName}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge 
                            variant="secondary" 
                            className={`text-[9px] uppercase font-bold border-none px-2 py-0 ${
                              log.actorRole === 'admin' 
                                ? 'bg-primary/10 text-primary' 
                                : log.actorRole === 'auditor'
                                ? 'bg-purple-600/10 text-purple-700 dark:text-purple-400'
                                : log.actorRole === 'accountant'
                                ? 'bg-blue-500/10 text-blue-600'
                                : log.actorRole === 'reviewer'
                                ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {log.actorRole}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Action Badge */}
                      <TableCell className="py-3 px-4">
                        <Badge variant="outline" className={`text-xs font-semibold px-2.5 py-0.5 border-none ${log.badgeColor}`}>
                          {log.actionLabel}
                        </Badge>
                      </TableCell>

                      {/* Details / Scope */}
                      <TableCell className="py-3 px-4 text-xs font-medium text-foreground">
                        <div className="line-clamp-2 max-w-md">
                          {formatDetailsSummary(log)}
                        </div>
                      </TableCell>

                      {/* Audit Justification */}
                      <TableCell className="py-3 px-4">
                        <p className="text-xs text-muted-foreground italic line-clamp-2" title={log.justification}>
                          &ldquo;{log.justification}&rdquo;
                        </p>
                      </TableCell>

                      {/* Inspect Button */}
                      <TableCell className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Inspector Dialog */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[650px] rounded-2xl max-h-[85vh] overflow-y-auto">
          {selectedLog && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-blue-600/10 text-blue-600">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <DialogTitle className="text-lg font-bold font-headline">Audit Record Inspector</DialogTitle>
                    <DialogDescription className="text-xs">
                      Permanent record ID: <code className="font-mono text-[11px] text-foreground">{selectedLog.id}</code>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                {/* Meta Attributes Grid */}
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-muted/40 rounded-xl border text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Action Executed</span>
                    <span className="font-bold text-foreground text-sm">{selectedLog.actionLabel}</span>
                    <span className="text-[10px] font-mono text-muted-foreground block">({selectedLog.action})</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Timestamp (UTC/Local)</span>
                    <span className="font-semibold text-foreground">{selectedLog.timestampFormatted}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Actor Name &amp; Role</span>
                    <span className="font-bold text-foreground">{selectedLog.actorName}</span>
                    <span className="text-[11px] text-primary block font-semibold uppercase">{selectedLog.actorRole}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Network Origin / IP</span>
                    <span className="font-mono text-muted-foreground">{selectedLog.ipAddress}</span>
                  </div>
                </div>

                {/* Justification Box */}
                <div className="p-3.5 bg-muted/30 rounded-xl border space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Recorded Audit Justification
                  </span>
                  <p className="text-xs text-foreground font-medium italic leading-relaxed">
                    &ldquo;{selectedLog.justification}&rdquo;
                  </p>
                </div>

                {/* Operation Scope / Details JSON */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Payload Metadata (JSON)
                  </span>
                  <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
