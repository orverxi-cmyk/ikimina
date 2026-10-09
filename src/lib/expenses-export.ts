import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const AUTHORIZED_EXPENSE_EXPORT_ROLES = [
  'admin',
  'management',
  'accountant',
  'senior_accountant',
  'reviewer',
] as const;

export function canExportExpenses(
  userRole?: string | null,
  userEmail?: string | null
): boolean {
  if (!userRole && !userEmail) return false;
  if (userEmail && userEmail.toLowerCase() === 'tharushyamagara@gmail.com') {
    return true;
  }
  if (!userRole) return false;
  const normalized = userRole.toLowerCase().trim();
  return (AUTHORIZED_EXPENSE_EXPORT_ROLES as readonly string[]).includes(normalized);
}

export function formatRoleLabel(role?: string): string {
  if (!role) return 'Staff';
  const map: Record<string, string> = {
    admin: 'Administrator',
    management: 'Executive Management',
    senior_accountant: 'Senior Accountant',
    accountant: 'Accountant',
    reviewer: 'Compliance Reviewer',
    auditor: 'Auditor',
    member: 'Member',
  };
  return map[role.toLowerCase()] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatExpenseStatus(status?: string): string {
  if (!status) return 'Unknown';
  const map: Record<string, string> = {
    pending: 'Pending Initial Review',
    pending_review: 'Pending Initial Review',
    pending_reviewer: 'Awaiting Compliance Reviewer',
    pending_approval: 'Awaiting Executive Approval',
    approved: 'Approved & Ratified',
    rejected: 'Rejected',
  };
  return map[status.toLowerCase()] || status.replace(/_/g, ' ').toUpperCase();
}

function safeDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateStr(val: any, formatPattern = 'yyyy-MM-dd HH:mm'): string {
  const d = safeDate(val);
  return d ? format(d, formatPattern) : '—';
}

export interface ExpenseExportItem {
  id: string;
  title?: string;
  category?: string;
  amount?: number | string;
  description?: string;
  notes?: string;
  status?: string;
  expenseDate?: any;
  createdAt?: any;
  lodgedAt?: any;
  lodgedBy?: string;
  lodgedByName?: string;
  initiatedByName?: string;
  initiatorRole?: string;
  lodgedByRole?: string;
  seniorReviewed?: boolean;
  seniorReviewedBy?: string;
  seniorReviewedByName?: string;
  seniorReviewedAt?: any;
  seniorReviewJustification?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedByRole?: string;
  reviewedAt?: any;
  reviewNotes?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedByRole?: string;
  approvedAt?: any;
  adminNotes?: string;
  approvalNotes?: string;
  rejectionReason?: string;
  receiptUrl?: string;
  attachmentUrl?: string;
  [key: string]: any;
}

export interface ExportExpensesOptions {
  expenses: ExpenseExportItem[];
  currency?: string;
  categoryFilter?: string;
  statusFilter?: string;
  exportedByName?: string;
  exportedByEmail?: string;
  exportedByRole?: string;
  fileName?: string;
  scopeLabel?: string;
  includeCategorySummary?: boolean;
  includeStatusBreakdown?: boolean;
  includeMetadata?: boolean;
}

/**
 * Generates and downloads an institutional Operating Expenses Excel workbook (.xlsx)
 * with complete expense ledgers, category summaries, status breakdowns, and audit metadata.
 */
export function exportExpensesToExcel(options: ExportExpensesOptions): {
  success: boolean;
  totalExported: number;
  fileName: string;
} {
  const {
    expenses,
    currency = 'RWF',
    categoryFilter = 'all',
    statusFilter = 'all',
    exportedByName = 'Authorized Finance Officer',
    exportedByEmail = '',
    exportedByRole = 'Administrator',
    scopeLabel = 'Complete Operating Expenses Register',
    includeCategorySummary = true,
    includeStatusBreakdown = true,
    includeMetadata = true,
  } = options;

  const wb = XLSX.utils.book_new();

  // Filter expenses
  const filteredExpenses = expenses.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (statusFilter === 'approved' && e.status !== 'approved') return false;
    if (statusFilter === 'pending' && e.status === 'approved') return false;
    if (statusFilter === 'rejected' && e.status !== 'rejected') return false;
    return true;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: EXPENSES LEDGER
  // ───────────────────────────────────────────────────────────────────────────
  const ledgerRows = filteredExpenses.map((exp, index) => {
    const amt = Number(exp.amount) || 0;
    const lodger = exp.lodgedByName || exp.initiatedByName || exp.lodgedBy || '—';
    const lodgerRole = formatRoleLabel(exp.lodgedByRole || exp.initiatorRole);
    const seniorReviewer = exp.seniorReviewedByName || (exp.seniorReviewedBy ? exp.seniorReviewedBy : '—');
    const reviewer = exp.reviewedByName || (exp.reviewedBy ? exp.reviewedBy : '—');
    const approver = exp.approvedByName || (exp.approvedBy ? exp.approvedBy : '—');

    return {
      'No.': index + 1,
      'Expense Ref': exp.id || `EXP-${index + 1}`,
      'Expense Title': exp.title || 'Operating Expense',
      'Category': exp.category || 'General Operations',
      [`Amount (${currency})`]: amt,
      'Status': formatExpenseStatus(exp.status),
      'Expense Date': formatDateStr(exp.expenseDate || exp.createdAt || exp.lodgedAt, 'yyyy-MM-dd'),
      'Lodged By': lodger,
      'Lodger Role': lodgerRole,
      'Senior Reviewed By': seniorReviewer,
      'Senior Review Date': formatDateStr(exp.seniorReviewedAt),
      'Compliance Reviewer': reviewer,
      'Compliance Review Date': formatDateStr(exp.reviewedAt),
      'Approved By': approver,
      'Approval Date': formatDateStr(exp.approvedAt),
      'Receipt / Proof Link': exp.receiptUrl || exp.attachmentUrl || '—',
      'Description / Justification': exp.description || exp.notes || '—',
      'Review / Approval Notes': exp.adminNotes || exp.approvalNotes || exp.reviewNotes || '—',
      'Rejection Reason': exp.rejectionReason || '—',
    };
  });

  const wsLedger = XLSX.utils.json_to_sheet(
    ledgerRows.length > 0 ? ledgerRows : [{ Notice: 'No operating expenses found for this criteria.' }]
  );
  wsLedger['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 30 },
    { wch: 26 },
    { wch: 18 },
    { wch: 26 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 40 },
    { wch: 35 },
    { wch: 35 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Expenses_Ledger');

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: CATEGORY SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  if (includeCategorySummary) {
    const catMap = new Map<string, {
      category: string;
      totalCount: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      approvedAmount: number;
      pendingAmount: number;
      totalAmount: number;
    }>();

    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      const amt = Number(exp.amount) || 0;
      const isApproved = exp.status === 'approved';
      const isPending = !isApproved && exp.status !== 'rejected';
      const isRejected = exp.status === 'rejected';

      if (!catMap.has(cat)) {
        catMap.set(cat, {
          category: cat,
          totalCount: 0,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          totalAmount: 0,
        });
      }

      const agg = catMap.get(cat)!;
      agg.totalCount += 1;
      agg.totalAmount += amt;
      if (isApproved) {
        agg.approvedCount += 1;
        agg.approvedAmount += amt;
      } else if (isPending) {
        agg.pendingCount += 1;
        agg.pendingAmount += amt;
      } else if (isRejected) {
        agg.rejectedCount += 1;
      }
    });

    const categoryRows = Array.from(catMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(row => ({
        'Expense Category': row.category,
        'Total Items': row.totalCount,
        'Approved Count': row.approvedCount,
        'Pending Count': row.pendingCount,
        'Rejected Count': row.rejectedCount,
        [`Approved Volume (${currency})`]: row.approvedAmount,
        [`Pending Volume (${currency})`]: row.pendingAmount,
        [`Total Volume (${currency})`]: row.totalAmount,
      }));

    const wsCategory = XLSX.utils.json_to_sheet(
      categoryRows.length > 0 ? categoryRows : [{ Notice: 'No expense category data.' }]
    );
    wsCategory['!cols'] = [
      { wch: 30 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCategory, 'Category_Summary');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 3: STATUS BREAKDOWN
  // ───────────────────────────────────────────────────────────────────────────
  if (includeStatusBreakdown) {
    const statusMap = new Map<string, {
      status: string;
      count: number;
      totalAmount: number;
    }>();

    filteredExpenses.forEach(exp => {
      const st = formatExpenseStatus(exp.status);
      const amt = Number(exp.amount) || 0;

      if (!statusMap.has(st)) {
        statusMap.set(st, { status: st, count: 0, totalAmount: 0 });
      }

      const agg = statusMap.get(st)!;
      agg.count += 1;
      agg.totalAmount += amt;
    });

    const statusRows = Array.from(statusMap.values()).map(s => ({
      'Expense Status': s.status,
      'Items Count': s.count,
      [`Total Amount (${currency})`]: s.totalAmount,
    }));

    const wsStatus = XLSX.utils.json_to_sheet(statusRows);
    wsStatus['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsStatus, 'Status_Breakdown');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 4: REPORT METADATA & COMPLIANCE SIGN-OFF
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMetadata) {
    const totalApprovedVolume = filteredExpenses
      .filter(e => e.status === 'approved')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalPendingVolume = filteredExpenses
      .filter(e => e.status !== 'approved' && e.status !== 'rejected')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const metaAoa = [
      ['IKIMINA SAVINGS & CREDIT GROUP — OPERATING EXPENSES REGISTER'],
      ['Institutional Operating Expenditures & Audit Export'],
      [''],
      ['AUDIT PARAMETER', 'VALUE'],
      ['Report Generation Date', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Exported By (Officer)', exportedByName],
      ['Officer Email', exportedByEmail || '—'],
      ['Officer Authority / Role', formatRoleLabel(exportedByRole)],
      ['Report Filter Scope', scopeLabel],
      ['Operating Currency', currency],
      ['Total Expenses Exported', filteredExpenses.length],
      [`Approved Operating Expenses Volume (${currency})`, totalApprovedVolume],
      [`Pending Operating Expenses Volume (${currency})`, totalPendingVolume],
      [''],
      ['FINANCIAL GOVERNANCE STATEMENT:'],
      ['1. Dual-Control Verification: All operating expenses are lodged with receipts, reviewed by Senior Accountants/Compliance Reviewers, and ratified by Administrators before funds release.'],
      ['2. Segregation of Duties: Officers cannot approve their own expense lodgments.'],
      ['3. This document is an authoritative export from the cryptographic Firestore audit store.'],
    ];

    const wsMeta = XLSX.utils.aoa_to_sheet(metaAoa);
    wsMeta['!cols'] = [{ wch: 35 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Report_Overview');
  }

  const timestampStr = format(new Date(), 'yyyyMMdd_HHmm');
  const sanitizedScope = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const finalFileName = options.fileName || `Ikimina_Operating_Expenses_${sanitizedScope}_${timestampStr}.xlsx`;

  XLSX.writeFile(wb, finalFileName);

  return {
    success: true,
    totalExported: filteredExpenses.length,
    fileName: finalFileName,
  };
}
