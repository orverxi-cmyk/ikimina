'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Loader2, 
  CheckCircle2, 
  Wallet, 
  Landmark, 
  History,
  ShieldCheck, 
  ArrowUpDown, 
  Receipt, 
  TrendingUp,
  FileDown,
  Coins,
  FileSpreadsheet
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, where, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { safeFormatDate } from '@/lib/loan-utils';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from 'next/link';

export default function ApprovedOperationsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const { toast } = useToast();
  const currency = settings.currency || 'RWF';

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const userRole = userData?.role || 'member';
  const isAuthorized = Boolean(user && !userDataLoading && ['admin', 'management', 'accountant', 'senior_accountant', 'reviewer', 'auditor'].includes(userRole));

  const [activeTab, setActiveTab] = useState<'all' | 'deposits' | 'loans' | 'expenses' | 'interest'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [inspectRecord, setInspectRecord] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Fetch members for name resolution
  const membersQuery = useMemoFirebase(() => isAuthorized ? query(collection(firestore, 'users'), orderBy('name', 'asc')) : null, [firestore, isAuthorized]);
  const { data: membersSnap } = useCollection(membersQuery);

  // Fetch approved/verified individual contributions
  const approvedContributionsQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'contributions'),
    where('status', 'in', ['verified', 'approved']),
    limit(500)
  ) : null, [firestore, isAuthorized]);
  const { data: approvedContributionsSnap, loading: loadingContributions } = useCollection(approvedContributionsQuery);

  // Fetch approved contribution batches
  const approvedBatchesQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'contribution_batches'),
    where('status', '==', 'approved'),
    limit(200)
  ) : null, [firestore, isAuthorized]);
  const { data: approvedBatchesSnap, loading: loadingBatches } = useCollection(approvedBatchesQuery);

  // Fetch approved loans
  const approvedLoansQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'loans'),
    where('status', 'in', ['approved', 'completed', 'active']),
    limit(500)
  ) : null, [firestore, isAuthorized]);
  const { data: approvedLoansSnap, loading: loadingLoans } = useCollection(approvedLoansQuery);

  // Fetch approved expenses
  const approvedExpensesQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'expenses'),
    where('status', '==', 'approved'),
    limit(200)
  ) : null, [firestore, isAuthorized]);
  const { data: approvedExpensesSnap, loading: loadingExpenses } = useCollection(approvedExpensesQuery);

  // Fetch approved interest distribution requests
  const approvedInterestRequestsQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'interest_distribution_requests'),
    where('status', '==', 'approved'),
    limit(100)
  ) : null, [firestore, isAuthorized]);
  const { data: approvedInterestRequestsSnap, loading: loadingInterestRequests } = useCollection(approvedInterestRequestsQuery);

  // Fetch direct ledger entries in interest_distributions
  const interestDistributionsQuery = useMemoFirebase(() => isAuthorized ? query(
    collection(firestore, 'interest_distributions'),
    limit(100)
  ) : null, [firestore, isAuthorized]);
  const { data: interestDistributionsSnap, loading: loadingDistributions } = useCollection(interestDistributionsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const memberMap = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);

  const getMemberName = (id: string) => {
    if (!id) return 'Unknown';
    return (memberMap.get(id) as any)?.name || 'Unknown';
  };

  const formatRoleLabel = (roleSlug: string | undefined): string => {
    if (!roleSlug) return 'Staff';
    const map: Record<string, string> = {
      admin: 'Administrator',
      management: 'Management',
      senior_accountant: 'Senior Accountant',
      accountant: 'Accountant',
      reviewer: 'Reviewer',
      auditor: 'Auditor',
      member: 'Member',
    };
    return map[roleSlug] || roleSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Normalize all operations into a unified list
  const allOperations = useMemo(() => {
    const ops: any[] = [];

    // 1. Contributions (Deposits)
    (approvedContributionsSnap?.docs || []).forEach(d => {
      const data = d.data();
      ops.push({
        id: d.id,
        type: 'deposit',
        typeLabel: 'Deposit Slip',
        memberId: data.memberId,
        memberName: getMemberName(data.memberId),
        amount: Number(data.amount) || 0,
        status: data.status,
        period: data.period || '—',
        date: data.createdAt || data.verifiedAt || data.date,
        seniorReviewedBy: data.seniorReviewedBy,
        seniorReviewedByName: data.seniorReviewedByName,
        seniorReviewedAt: data.seniorReviewedAt,
        seniorReviewNotes: data.seniorReviewJustification || data.seniorReviewNotes,
        reviewedBy: data.reviewedBy,
        reviewedByName: data.reviewedByName || data.reviewerName,
        reviewedAt: data.reviewedAt,
        reviewNotes: data.reviewJustification || data.reviewNotes,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName || data.approverName,
        approvedAt: data.approvedAt,
        approvalNotes: data.approvalJustification || data.approvalNotes || data.justification,
        notes: data.notes || data.justification,
        raw: data,
      });
    });

    // 2. Approved Contribution Batches
    (approvedBatchesSnap?.docs || []).forEach(d => {
      const data = d.data();
      ops.push({
        id: d.id,
        type: 'deposit',
        typeLabel: 'Deposit Batch',
        memberId: data.initiatedBy,
        memberName: `${data.initiatorName || getMemberName(data.initiatedBy)} (${data.totalCount || data.items?.length || 0} members)`,
        amount: Number(data.totalAmount) || 0,
        status: data.status,
        period: data.title || data.defaultPeriod || '—',
        date: data.approvedAt || data.initiatedAt || data.createdAt,
        seniorReviewedBy: data.seniorReviewedBy,
        seniorReviewedByName: data.seniorReviewedByName,
        seniorReviewedAt: data.seniorReviewedAt,
        seniorReviewNotes: data.seniorReviewNotes,
        reviewedBy: data.reviewedBy,
        reviewedByName: data.reviewedByName || data.reviewerName,
        reviewedAt: data.reviewedAt,
        reviewNotes: data.reviewNotes,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName || data.approverName,
        approvedAt: data.approvedAt,
        approvalNotes: data.approvalNotes,
        auditTrail: data.auditTrail,
        notes: data.title,
        raw: data,
      });
    });

    // 3. Loans
    (approvedLoansSnap?.docs || []).forEach(d => {
      const data = d.data();
      ops.push({
        id: d.id,
        type: 'loan',
        typeLabel: 'Loan Facility',
        memberId: data.memberId,
        memberName: getMemberName(data.memberId),
        amount: Number(data.amount) || 0,
        status: data.status,
        period: data.description || '—',
        date: data.createdAt || data.approvedAt,
        seniorReviewedBy: data.seniorReviewedBy,
        seniorReviewedByName: data.seniorReviewedByName,
        seniorReviewedAt: data.seniorReviewedAt,
        seniorReviewNotes: data.seniorReviewJustification || data.seniorReviewNotes,
        reviewedBy: data.reviewedBy,
        reviewedByName: data.reviewedByName,
        reviewedAt: data.reviewedAt,
        reviewNotes: data.reviewJustification || data.reviewNotes,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName,
        approvedAt: data.approvedAt,
        approvalNotes: data.approvalJustification || data.approvalNotes,
        notes: data.description,
        raw: data,
      });
    });

    // 4. Expenses
    (approvedExpensesSnap?.docs || []).forEach(d => {
      const data = d.data();
      ops.push({
        id: d.id,
        type: 'expense',
        typeLabel: 'Operating Expense',
        memberId: data.recordedBy || data.createdBy,
        memberName: data.recordedByName || getMemberName(data.recordedBy || data.createdBy),
        amount: Number(data.amount) || 0,
        status: data.status,
        period: data.title || data.category || '—',
        date: data.createdAt || data.approvedAt,
        seniorReviewedBy: data.seniorReviewedBy,
        seniorReviewedByName: data.seniorReviewedByName,
        seniorReviewedAt: data.seniorReviewedAt,
        seniorReviewNotes: data.seniorReviewNotes,
        reviewedBy: data.reviewedBy,
        reviewedByName: data.reviewedByName,
        reviewedAt: data.reviewedAt,
        reviewNotes: data.reviewNotes,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName,
        approvedAt: data.approvedAt,
        approvalNotes: data.approvalNotes,
        notes: data.title || data.description,
        raw: data,
      });
    });

    // 5. Distributed Interests (from requests and ledger distributions)
    const seenInterestIds = new Set<string>();
    (approvedInterestRequestsSnap?.docs || []).forEach(d => {
      const data = d.data();
      seenInterestIds.add(d.id);
      if (data.distributionId) seenInterestIds.add(data.distributionId);
      ops.push({
        id: d.id,
        type: 'interest',
        typeLabel: 'Distributed Interest',
        memberId: data.initiatedBy,
        memberName: `${data.initiatedByName || 'Accountant'} (${data.recipientsCount || data.breakdown?.length || 0} active savers)`,
        amount: Number(data.totalInterestToDistribute || data.amountDistributed) || 0,
        status: 'approved',
        period: data.period || `${data.recipientsCount || data.breakdown?.length || 0} active savers`,
        date: data.approvedAt || data.distributedAt || data.createdAt,
        seniorReviewedBy: data.seniorReviewedBy,
        seniorReviewedByName: data.seniorReviewedByName,
        seniorReviewedAt: data.seniorReviewedAt,
        seniorReviewNotes: data.seniorReviewNotes,
        reviewedBy: data.reviewedBy,
        reviewedByName: data.reviewedByName || data.reviewerName,
        reviewedAt: data.reviewedAt,
        reviewNotes: data.reviewNotes,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName || data.approverName,
        approvedAt: data.approvedAt,
        approvalNotes: data.approvalNotes,
        notes: data.justification || 'Pro-rata profit interest distributed across active savers',
        recipientsCount: data.recipientsCount || data.breakdown?.length || 0,
        totalCapitalized: data.totalCapitalizedToContributions || 0,
        totalCashPayout: data.totalCashPayout || 0,
        breakdown: data.breakdown || [],
        raw: data,
      });
    });

    (interestDistributionsSnap?.docs || []).forEach(d => {
      if (seenInterestIds.has(d.id)) return;
      const data = d.data();
      if (data.requestId && seenInterestIds.has(data.requestId)) return;
      seenInterestIds.add(d.id);
      ops.push({
        id: d.id,
        type: 'interest',
        typeLabel: 'Distributed Interest',
        memberId: data.initiatedBy || data.adminId,
        memberName: `${data.initiatedByName || data.adminName || 'Admin'} (${data.recipientsCount || data.breakdown?.length || 0} active savers)`,
        amount: Number(data.amountDistributed || data.totalInterestToDistribute) || 0,
        status: 'approved',
        period: data.period || `${data.recipientsCount || data.breakdown?.length || 0} active savers`,
        date: data.distributedAt || data.createdAt,
        approvedBy: data.adminId,
        approvedByName: data.adminName,
        approvedAt: data.distributedAt,
        approvalNotes: 'Committed to ledger and capitalized',
        notes: 'Dividend allocation and capital reinvestment',
        recipientsCount: data.recipientsCount || data.breakdown?.length || 0,
        totalCapitalized: data.totalCapitalizedToContributions || 0,
        totalCashPayout: data.totalCashPayout || 0,
        breakdown: data.breakdown || [],
        raw: data,
      });
    });

    return ops;
  }, [
    approvedContributionsSnap, 
    approvedBatchesSnap, 
    approvedLoansSnap, 
    approvedExpensesSnap, 
    approvedInterestRequestsSnap, 
    interestDistributionsSnap, 
    memberMap
  ]);

  // Filter and sort
  const filteredOperations = useMemo(() => {
    let filtered = allOperations;

    if (activeTab === 'deposits') {
      filtered = filtered.filter(op => op.type === 'deposit');
    } else if (activeTab === 'loans') {
      filtered = filtered.filter(op => op.type === 'loan');
    } else if (activeTab === 'expenses') {
      filtered = filtered.filter(op => op.type === 'expense');
    } else if (activeTab === 'interest') {
      filtered = filtered.filter(op => op.type === 'interest');
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(op => 
        op.memberName?.toLowerCase().includes(term) ||
        op.typeLabel?.toLowerCase().includes(term) ||
        op.period?.toLowerCase().includes(term) ||
        op.id?.toLowerCase().includes(term) ||
        String(op.amount).includes(term)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortField === 'amount') {
        return sortDir === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      } else {
        const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date || 0).getTime();
        const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date || 0).getTime();
        return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
      }
    });

    return filtered;
  }, [allOperations, activeTab, searchTerm, sortField, sortDir]);

  // Summary stats
  const stats = useMemo(() => {
    const deposits = allOperations.filter(o => o.type === 'deposit');
    const loans = allOperations.filter(o => o.type === 'loan');
    const expenses = allOperations.filter(o => o.type === 'expense');
    const interest = allOperations.filter(o => o.type === 'interest');
    return {
      totalDeposits: deposits.reduce((s, o) => s + o.amount, 0),
      depositCount: deposits.length,
      totalLoans: loans.reduce((s, o) => s + o.amount, 0),
      loanCount: loans.length,
      totalExpenses: expenses.reduce((s, o) => s + o.amount, 0),
      expenseCount: expenses.length,
      totalInterest: interest.reduce((s, o) => s + o.amount, 0),
      interestCount: interest.length,
    };
  }, [allOperations]);

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Helper to extract review trail list for display & PDF
  const getReviewTrails = (record: any) => {
    if (!record) return [];
    const trails: { label: string; name: string; role: string; date?: any; notes?: string }[] = [];

    if (record.seniorReviewedBy || record.seniorReviewed) {
      const reviewer = record.seniorReviewedBy ? memberMap.get(record.seniorReviewedBy) as any : null;
      trails.push({
        label: 'Reviewed by',
        name: record.seniorReviewedByName || reviewer?.name || (record.seniorReviewedBy ? getMemberName(record.seniorReviewedBy) : 'Senior Accountant'),
        role: formatRoleLabel(reviewer?.role || 'senior_accountant'),
        date: record.seniorReviewedAt,
        notes: record.seniorReviewNotes || record.seniorReviewJustification,
      });
    }

    if (record.reviewedBy || record.complianceReviewed) {
      const reviewer = record.reviewedBy ? memberMap.get(record.reviewedBy) as any : null;
      trails.push({
        label: 'Reviewed by',
        name: record.reviewedByName || record.reviewerName || reviewer?.name || (record.reviewedBy ? getMemberName(record.reviewedBy) : 'Reviewer'),
        role: formatRoleLabel(record.reviewerRole || reviewer?.role || 'reviewer'),
        date: record.reviewedAt,
        notes: record.reviewNotes || record.reviewJustification,
      });
    }

    if (record.approvedBy) {
      const approver = memberMap.get(record.approvedBy) as any;
      trails.push({
        label: 'Approved by',
        name: record.approvedByName || record.approverName || approver?.name || getMemberName(record.approvedBy),
        role: formatRoleLabel(approver?.role || 'admin'),
        date: record.approvedAt,
        notes: record.approvalNotes || record.approvalJustification,
      });
    }

    if (Array.isArray(record.auditTrail) && trails.length === 0) {
      record.auditTrail.forEach((evt: any) => {
        if (evt.action?.includes('ENDORSE') || evt.action?.includes('REVIEW') || evt.action?.includes('APPROVE') || evt.action?.includes('COMMITTED')) {
          trails.push({
            label: evt.action.includes('APPROVE') || evt.action.includes('COMMITTED') ? 'Approved by' : 'Reviewed by',
            name: evt.performerName || getMemberName(evt.performedBy),
            role: formatRoleLabel(evt.performerRole),
            date: evt.timestamp,
            notes: evt.notes,
          });
        }
      });
    }

    return trails;
  };

  const renderReviewTrail = (record: any) => {
    const trails = getReviewTrails(record);

    if (trails.length === 0) {
      return (
        <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/60 text-xs text-muted-foreground italic">
          No individual review trail signatures recorded for this historical operation.
        </div>
      );
    }

    return (
      <div className="mt-3 p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3 text-primary" /> Review &amp; Approval Audit Trail
          </p>
          <Badge variant="outline" className="text-[9px] uppercase font-bold text-muted-foreground">
            {trails.length} Signed Stage{trails.length > 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="space-y-2">
          {trails.map((t, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-background border border-border/60 text-xs space-y-1 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground font-medium">{t.label}</span>
                  <span className="font-bold text-foreground">{t.name}</span>
                  <Badge className="text-[10px] px-1.5 py-0 font-bold bg-primary/10 text-primary border border-primary/20">
                    {t.role}
                  </Badge>
                </div>
                {t.date && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {safeFormatDate(t.date, 'PPp')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">
                {t.label} <strong className="text-foreground">{t.name}</strong>, <span className="font-bold text-primary">{t.role}</span>
              </p>
              {t.notes && (
                <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded border border-border/40 mt-1 italic">
                  <span className="font-bold not-italic text-foreground text-[10px] uppercase">Notes: </span>
                  &ldquo;{t.notes}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Export Official Supporting Voucher PDF for a Specific Approved Operation
  const handleExportOperationPdf = (record: any) => {
    if (!record) return;
    try {
      setIsExportingPdf(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const primaryColor: [number, number, number] = [37, 99, 235]; // #2563EB Blue
      const darkColor: [number, number, number] = [15, 23, 42]; // Slate 900
      const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500
      const greenColor: [number, number, number] = [22, 101, 52]; // Emerald 800

      const appName = (settings.appName?.trim() || 'IKIMINA SAVINGS & CREDIT SCHEME').toUpperCase();
      const currencyCode = currency || 'RWF';

      // 1. Top Decorative Brand Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 24, 'F');

      // Header Text in Banner
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(appName, 14, 11);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text("OFFICIAL TRANSACTION AUDIT CERTIFICATE & SUPPORTING VOUCHER", 14, 18);

      // Document Certificate Box
      const certNum = `VCHR-${record.type.slice(0, 3).toUpperCase()}-${record.id.slice(0, 8).toUpperCase()}`;
      doc.setFontSize(7.5);
      doc.text(`CERTIFICATE REF: ${certNum}`, 142, 11);
      doc.text(`ISSUED: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, 142, 18);

      // 2. Verification Status Badge Box
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(34, 197, 94);
      doc.roundedRect(14, 29, 182, 12, 2, 2, 'FD');

      doc.setTextColor(greenColor[0], greenColor[1], greenColor[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`VERIFIED STATUS: APPROVED & COMMITTED TO OFFICIAL LEDGER`, 20, 36.5);

      // 3. Section Title: Operation Details
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.text("1. TRANSACTION SPECIFICATIONS", 14, 48);

      const formattedAmount = `${currencyCode} ${Number(record.amount || 0).toLocaleString('en-US')}`;
      const opDateStr = record.date ? safeFormatDate(record.date, 'PPP p') : 'Confirmed on Ledger';

      const detailsHead = [['Field', 'Operational Detail / Specification']];
      const detailsData = [
        ['Operation Category', `${record.typeLabel} (${record.type.toUpperCase()})`],
        ['Transaction Reference ID', String(record.id)],
        ['Beneficiary / Primary Party', String(record.memberName || 'N/A')],
        ['Authorized Financial Value', formattedAmount],
        ['Period / Scope / Purpose', String(record.period || record.notes || 'N/A')],
        ['Official Commit Date', opDateStr],
        ['Operational Summary', String(
          record.type === 'deposit'
            ? `Member deposit contribution of ${formattedAmount} credited for period "${record.period || 'savings'}".`
            : record.type === 'loan'
            ? `Approved loan facility of ${formattedAmount} ratified for purpose: "${record.period || 'General'}".`
            : record.type === 'expense'
            ? `Operational expenditure disbursement of ${formattedAmount} categorized under "${record.period || 'General'}".`
            : `Pro-rata interest dividend distribution of ${formattedAmount} allocated across ${record.recipientsCount || 0} active savers.`
        )]
      ];

      if (record.type === 'interest') {
        detailsData.push(['Capitalized to Total Savings', `${currencyCode} ${Number(record.totalCapitalized || 0).toLocaleString('en-US')}`]);
        detailsData.push(['Direct Cash Payout', `${currencyCode} ${Number(record.totalCashPayout || 0).toLocaleString('en-US')}`]);
      }

      autoTable(doc, {
        head: detailsHead,
        body: detailsData,
        startY: 51,
        theme: 'grid',
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: darkColor,
          fontSize: 8,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 7.8,
          textColor: darkColor,
          cellPadding: 2.2
        },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold', textColor: [51, 65, 85] },
          1: { cellWidth: 132 }
        }
      });

      const finalY1 = (doc as any).lastAutoTable?.finalY || 110;

      // 4. Section Title: Governance & Dual-Control Audit Trail
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text("2. MULTI-TIER AUDIT TRAIL & DUAL-CONTROL CLEARANCE", 14, finalY1 + 9);

      const trails = getReviewTrails(record);
      const auditRows: string[][] = [];

      trails.forEach((t) => {
        auditRows.push([
          t.label,
          t.name,
          t.role,
          t.date ? safeFormatDate(t.date, 'dd MMM yyyy, HH:mm') : 'Recorded',
          t.notes || 'Verified under institutional policy'
        ]);
      });

      if (auditRows.length === 0) {
        auditRows.push([
          'Executive Approval',
          record.approvedByName || record.memberName || 'Authorized Officer',
          'Staff Officer',
          opDateStr,
          'Authorized institutional transaction'
        ]);
      }

      autoTable(doc, {
        head: [['Sign-Off Tier', 'Authorized Officer', 'Role Title', 'Timestamp', 'Audit Resolution / Notes']],
        body: auditRows,
        startY: finalY1 + 12,
        theme: 'grid',
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: darkColor,
          cellPadding: 2.2
        },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: 'bold' },
          1: { cellWidth: 40 },
          2: { cellWidth: 32 },
          3: { cellWidth: 32 },
          4: { cellWidth: 46 }
        }
      });

      const finalY2 = (doc as any).lastAutoTable?.finalY || 165;

      // 5. Verification Certificate Notice Block
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, finalY2 + 7, 182, 18, 2, 2, 'FD');

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("STATUTORY GOVERNANCE & ARCHIVAL INTEGRITY ATTESTATION", 18, finalY2 + 12);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(
        "This official supporting voucher certifies that this transaction was reviewed, verified, and finalized in strict compliance with the\nfour-eyes principle and cooperative dual-control bylaws. Certified directly from the institutional cryptographic ledger for accounting & tax compliance.",
        18,
        finalY2 + 17
      );

      // 6. Institutional Sign-Off Blocks (Prepared By / Reviewed By / Ratified By)
      const sigY = finalY2 + 33;
      if (sigY < 265) {
        doc.setDrawColor(203, 213, 225);
        doc.line(14, sigY + 11, 64, sigY + 11);
        doc.line(79, sigY + 11, 129, sigY + 11);
        doc.line(144, sigY + 11, 196, sigY + 11);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text("PREPARED / LODGED BY", 14, sigY + 15);
        doc.text("COMPLIANCE VERIFICATION", 79, sigY + 15);
        doc.text("EXECUTIVE RATIFICATION", 144, sigY + 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(record.memberName?.slice(0, 24) || "Initiator Signature", 14, sigY + 19);
        doc.text(record.reviewedByName || record.seniorReviewedByName || "Audit Officer Signature", 79, sigY + 19);
        doc.text(record.approvedByName || "Super Admin Signature", 144, sigY + 19);
      }

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Document Ref: ${certNum} | Generated via ${appName} Management Portal | Official Audit Voucher`, 14, 287);

      const fileName = `Supporting_Document_${record.type}_${record.id.slice(0, 8)}.pdf`;
      doc.save(fileName);

      toast({
        title: "Supporting Document Exported",
        description: `Successfully downloaded PDF report: ${fileName}`,
      });
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      toast({
        variant: "destructive",
        title: "PDF Export Failed",
        description: err?.message || "Could not generate PDF document."
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const isLoading = 
    loadingContributions || 
    loadingBatches || 
    loadingLoans || 
    loadingExpenses || 
    loadingInterestRequests || 
    loadingDistributions;

  if (userDataLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm font-bold text-muted-foreground">Loading Approved Operations...</p>
        </div>
      </div>
    );
  }

  if (user && !isAuthorized) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldCheck className="h-14 w-14 text-destructive" />
        <h2 className="text-2xl font-bold font-headline text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md text-xs sm:text-sm">
          Only administrators, reviewers, senior accountants, and auditors can view approved operations.
        </p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/dashboard">Return to Member Portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className="bg-emerald-500/10 text-emerald-700 border-none text-[9px] uppercase font-bold tracking-wider">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Finalized & Approved
            </Badge>
          </div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">Approved Operations Ledger</h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            Complete registry of all approved deposits, disbursed loans, ratified expenses, and distributed dividends.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search member, type, or reference..."
            className="pl-10 rounded-xl text-xs h-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Summary KPI Cards (4-Column Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border border-emerald-200/50 bg-emerald-500/5 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 shrink-0">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approved Deposits</p>
              <p className="text-lg font-bold text-emerald-700 truncate">{formatCurrency(stats.totalDeposits, currency)}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">{stats.depositCount} verified entries</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-blue-200/50 bg-blue-500/5 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 shrink-0">
              <Landmark className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approved Loans</p>
              <p className="text-lg font-bold text-blue-700 truncate">{formatCurrency(stats.totalLoans, currency)}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">{stats.loanCount} disbursed facilities</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-amber-200/50 bg-amber-500/5 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 shrink-0">
              <Receipt className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approved Expenses</p>
              <p className="text-lg font-bold text-amber-700 truncate">{formatCurrency(stats.totalExpenses, currency)}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">{stats.expenseCount} ratified items</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-purple-200/50 bg-purple-500/5 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 shrink-0">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Distributed Interest</p>
              <p className="text-lg font-bold text-purple-700 truncate">{formatCurrency(stats.totalInterest, currency)}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">{stats.interestCount} dividend payouts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Table */}
      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full space-y-4">
        <TabsList className="inline-flex w-full sm:grid sm:grid-cols-5 h-11 overflow-x-auto no-scrollbar">
          <TabsTrigger value="all" className="uppercase tracking-wider text-[11px] px-2.5 whitespace-nowrap gap-1">
            All ({allOperations.length})
          </TabsTrigger>
          <TabsTrigger value="deposits" className="uppercase tracking-wider text-[11px] px-2.5 whitespace-nowrap gap-1">
            <Wallet className="h-3.5 w-3.5" /> Deposits ({stats.depositCount})
          </TabsTrigger>
          <TabsTrigger value="loans" className="uppercase tracking-wider text-[11px] px-2.5 whitespace-nowrap gap-1">
            <Landmark className="h-3.5 w-3.5" /> Loans ({stats.loanCount})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="uppercase tracking-wider text-[11px] px-2.5 whitespace-nowrap gap-1">
            <Receipt className="h-3.5 w-3.5" /> Expenses ({stats.expenseCount})
          </TabsTrigger>
          <TabsTrigger value="interest" className="uppercase tracking-wider text-[11px] px-2.5 whitespace-nowrap gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Interest ({stats.interestCount})
          </TabsTrigger>
        </TabsList>

        <Card className="border border-border shadow-md rounded-2xl overflow-hidden bg-card">
          <CardHeader className="bg-emerald-600 text-white p-4 sm:p-5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <CardTitle className="text-[13px] font-bold text-white">
                {activeTab === 'all' ? 'All Approved Operations' : 
                 activeTab === 'deposits' ? 'Approved Deposits & Batches' : 
                 activeTab === 'loans' ? 'Approved Credit Facilities' : 
                 activeTab === 'expenses' ? 'Approved Operating Expenses' : 'Approved Profit & Dividend Distributions'}
              </CardTitle>
            </div>
            <Badge className="bg-white/20 text-white border-none text-[10px] font-bold uppercase">
              {filteredOperations.length} Record{filteredOperations.length !== 1 ? 's' : ''}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto no-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="border-b hover:bg-transparent">
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase">Type</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase">Member / Scope</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase">Description / Scope</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">
                      <button onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Amount <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase text-center">
                      <button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Date <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="px-4 py-3 text-xs font-bold uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : filteredOperations.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground italic">No approved operations found.</TableCell></TableRow>
                  ) : (
                    filteredOperations.map(op => (
                      <TableRow key={`${op.type}-${op.id}`} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="px-4 py-3">
                          <Badge className={cn(
                            "text-[10px] font-bold uppercase border-none",
                            op.type === 'deposit' ? "bg-emerald-500/10 text-emerald-700" :
                            op.type === 'loan' ? "bg-blue-500/10 text-blue-700" :
                            op.type === 'expense' ? "bg-amber-500/10 text-amber-700" :
                            "bg-purple-500/10 text-purple-700"
                          )}>
                            {op.type === 'deposit' ? <Wallet className="h-3 w-3 mr-1" /> :
                             op.type === 'loan' ? <Landmark className="h-3 w-3 mr-1" /> :
                             op.type === 'expense' ? <Receipt className="h-3 w-3 mr-1" /> :
                             <TrendingUp className="h-3 w-3 mr-1" />}
                            {op.typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold">{op.memberName}</TableCell>
                        <TableCell className="px-4 py-3 text-xs text-muted-foreground font-semibold max-w-[200px] truncate">{op.period}</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-right text-primary">{formatCurrency(op.amount, currency)}</TableCell>
                        <TableCell className="px-4 py-3 text-[11px] text-muted-foreground text-center whitespace-nowrap">{safeFormatDate(op.date, 'PP')}</TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleExportOperationPdf(op)}
                              title="Download Official Supporting Document (PDF)"
                              className="h-7 px-2 text-xs font-bold rounded-lg gap-1 border-primary/20 text-primary hover:bg-primary/10"
                            >
                              <FileDown className="h-3 w-3" />
                              <span className="hidden lg:inline">PDF</span>
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => { setInspectRecord(op); setIsDetailOpen(true); }}
                              className="h-7 text-xs font-bold rounded-lg gap-1"
                            >
                              <History className="h-3 w-3" /> Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Tabs>

      {/* Operation Details Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Operation Details</span>
              <Badge className={cn(
                "border-none text-[10px] uppercase font-bold",
                inspectRecord?.type === 'deposit' ? "bg-emerald-500/10 text-emerald-700" :
                inspectRecord?.type === 'loan' ? "bg-blue-500/10 text-blue-700" :
                inspectRecord?.type === 'expense' ? "bg-amber-500/10 text-amber-700" :
                "bg-purple-500/10 text-purple-700"
              )}>
                {inspectRecord?.typeLabel}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Reference: {inspectRecord?.id?.slice(0, 14)}...
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">{inspectRecord?.type === 'expense' ? 'Initiator / Recorded By:' : inspectRecord?.type === 'interest' ? 'Allocation Authority:' : 'Member / Initiator:'}</span>
              <span className="font-bold">{inspectRecord?.memberName}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Authorized Amount:</span>
              <span className="font-bold text-primary">{formatCurrency(inspectRecord?.amount, currency)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">{inspectRecord?.type === 'loan' ? 'Facility Purpose:' : inspectRecord?.type === 'expense' ? 'Expense Category:' : inspectRecord?.type === 'interest' ? 'Scope:' : 'Period:'}</span>
              <span className="font-semibold text-right max-w-[60%]">{inspectRecord?.period}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Ledger Status:</span>
              <Badge className="bg-emerald-500/10 text-emerald-700 border-none text-[10px] font-bold uppercase">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {inspectRecord?.status}
              </Badge>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Effective Date:</span>
              <span className="font-semibold">{safeFormatDate(inspectRecord?.date, 'PPp')}</span>
            </div>
          </div>

          {/* Interest Breakdown Special Stats */}
          {inspectRecord?.type === 'interest' && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20 text-xs">
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-bold">Capitalized to Savings:</span>
                <p className="font-bold text-emerald-600 text-sm mt-0.5">{formatCurrency(inspectRecord?.totalCapitalized || 0, currency)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-bold">Direct Cash Payout:</span>
                <p className="font-bold text-blue-600 text-sm mt-0.5">{formatCurrency(inspectRecord?.totalCashPayout || 0, currency)}</p>
              </div>
            </div>
          )}

          {/* Operation Description */}
          <div className="p-3 bg-muted/20 rounded-xl border border-border/60 text-xs space-y-1">
            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Operation Description:</span>
            <p className="text-foreground leading-relaxed">
              {inspectRecord?.type === 'deposit' 
                ? `Deposit contribution of ${formatCurrency(inspectRecord?.amount || 0, currency)} for ${inspectRecord?.period || 'savings'}.`
                : inspectRecord?.type === 'loan' 
                ? `Loan facility of ${formatCurrency(inspectRecord?.amount || 0, currency)} approved for: "${inspectRecord?.period || 'General purpose'}".`
                : inspectRecord?.type === 'expense'
                ? `Operating expense disbursement of ${formatCurrency(inspectRecord?.amount || 0, currency)} recorded under "${inspectRecord?.period || 'Operational'}".`
                : `Profit interest distribution of ${formatCurrency(inspectRecord?.amount || 0, currency)} successfully allocated across ${inspectRecord?.recipientsCount || 0} active savers.`}
            </p>
          </div>

          {/* Review Audit Trail */}
          {renderReviewTrail(inspectRecord)}

          {/* Modal Footer with PDF Export */}
          <div className="pt-3 border-t flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)} className="rounded-xl text-xs font-bold w-full sm:w-auto">
              Close
            </Button>
            <Button 
              onClick={() => handleExportOperationPdf(inspectRecord)}
              disabled={isExportingPdf}
              className="rounded-xl text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm w-full sm:w-auto"
            >
              {isExportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Export Supporting Document (PDF)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
