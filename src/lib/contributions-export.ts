import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const AUTHORIZED_CONTRIBUTION_EXPORT_ROLES = [
  'admin',
  'management',
  'accountant',
  'senior_accountant',
  'reviewer',
] as const;

/**
 * Checks whether a user has administrative, accounting, or review privileges
 * to export the members' contributions Excel register.
 */
export function canExportContributions(
  userRole?: string | null,
  userEmail?: string | null
): boolean {
  if (!userRole && !userEmail) return false;
  if (userEmail && userEmail.toLowerCase() === 'tharushyamagara@gmail.com') {
    return true;
  }
  if (!userRole) return false;
  const normalized = userRole.toLowerCase().trim();
  return (AUTHORIZED_CONTRIBUTION_EXPORT_ROLES as readonly string[]).includes(normalized);
}

export function formatRoleLabel(role?: string): string {
  if (!role) return 'Member';
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

export function formatStatusLabel(status?: string): string {
  if (!status) return 'Unknown';
  const map: Record<string, string> = {
    pending: 'Pending Initial Review',
    pending_review: 'Pending Initial Review',
    pending_reviewer: 'Awaiting Reviewer',
    reviewed: 'Reviewed — Pending Approval',
    pending_approval: 'Awaiting Executive Approval',
    revision_requested: 'Revision Requested',
    approved: 'Approved & Committed',
    verified: 'Approved & Committed',
    rejected: 'Rejected',
    reversed: 'Reversed',
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

export interface ContributionExportItem {
  id: string;
  memberId?: string;
  amount?: number | string;
  period?: string;
  date?: any;
  createdAt?: any;
  timestamp?: any;
  status?: string;
  recordedBy?: string;
  recordedByName?: string;
  seniorReviewed?: boolean;
  seniorReviewedBy?: string;
  seniorReviewedByName?: string;
  seniorReviewedAt?: any;
  seniorReviewJustification?: string;
  seniorReviewNotes?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedByRole?: string;
  reviewedAt?: any;
  reviewJustification?: string;
  reviewNotes?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedByRole?: string;
  approvedAt?: any;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: any;
  justification?: string;
  notes?: string;
  rejectionReason?: string;
  proofUrl?: string;
  entryMethod?: string;
  batchId?: string;
  batchTitle?: string;
  [key: string]: any;
}

export interface BatchExportItem {
  id: string;
  batchId?: string;
  title?: string;
  defaultPeriod?: string;
  totalAmount?: number | string;
  totalCount?: number;
  items?: any[];
  status?: string;
  initiatedBy?: string;
  initiatorName?: string;
  initiatorRole?: string;
  initiatedAt?: any;
  createdAt?: any;
  reviewedByName?: string;
  reviewedByRole?: string;
  reviewedAt?: any;
  approvedByName?: string;
  approvedByRole?: string;
  approvedAt?: any;
  reviewNotes?: string;
  approvalNotes?: string;
  [key: string]: any;
}

export interface ExportContributionsOptions {
  slips: ContributionExportItem[];
  batches?: BatchExportItem[];
  memberMap: Map<string, any> | Record<string, any>;
  currency?: string;
  exportedByName?: string;
  exportedByEmail?: string;
  exportedByRole?: string;
  fileName?: string;
  scopeLabel?: string;
  includeMemberSummary?: boolean;
  includePeriodSummary?: boolean;
  includeBatches?: boolean;
  includeMetadata?: boolean;
}

/**
 * Generates and downloads an institutional Excel workbook (.xlsx) containing
 * member contributions, multi-level audit details, summaries by member and period.
 */
export function exportContributionsToExcel(options: ExportContributionsOptions): {
  success: boolean;
  totalExported: number;
  fileName: string;
} {
  const {
    slips,
    batches = [],
    memberMap,
    currency = 'RWF',
    exportedByName = 'Authorized Officer',
    exportedByEmail = '',
    exportedByRole = 'Administrator',
    scopeLabel = 'Complete Ledger',
    includeMemberSummary = true,
    includePeriodSummary = true,
    includeBatches = true,
    includeMetadata = true,
  } = options;

  const getMember = (id?: string) => {
    if (!id) return null;
    if (memberMap instanceof Map) {
      return memberMap.get(id) || null;
    }
    return (memberMap as Record<string, any>)[id] || null;
  };

  const wb = XLSX.utils.book_new();

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: CONTRIBUTIONS REGISTER (DETAILED LEDGER)
  // ───────────────────────────────────────────────────────────────────────────
  const ledgerRows = slips.map((slip, index) => {
    const member = getMember(slip.memberId);
    const memberName = member?.name || member?.displayName || slip.memberName || slip.memberId || 'Unknown Member';
    const memberEmail = member?.email || slip.memberEmail || '—';
    const memberPhone = member?.phone || member?.phoneNumber || '—';
    const memberRole = formatRoleLabel(member?.role);
    const amountVal = Number(slip.amount) || 0;

    const recordedBy = slip.recordedByName || (slip.recordedBy ? (getMember(slip.recordedBy)?.name || slip.recordedBy) : 'Member (Self)');
    const seniorReviewer = slip.seniorReviewedByName || (slip.seniorReviewedBy ? (getMember(slip.seniorReviewedBy)?.name || slip.seniorReviewedBy) : '—');
    const seniorReviewDate = formatDateStr(slip.seniorReviewedAt);
    const reviewer = slip.reviewedByName || (slip.reviewedBy ? (getMember(slip.reviewedBy)?.name || slip.reviewedBy) : '—');
    const reviewDate = formatDateStr(slip.reviewedAt);
    const approver = slip.approvedByName || slip.verifiedByName || (slip.approvedBy ? (getMember(slip.approvedBy)?.name || slip.approvedBy) : (slip.verifiedBy ? (getMember(slip.verifiedBy)?.name || slip.verifiedBy) : '—'));
    const approveDate = formatDateStr(slip.approvedAt || slip.verifiedAt);

    return {
      'No.': index + 1,
      'Transaction Ref': slip.id || `TXN-${index + 1}`,
      'Member Name': memberName,
      'Member Email': memberEmail,
      'Phone Number': memberPhone,
      'Member Role': memberRole,
      'Period': slip.period || 'General',
      [`Amount (${currency})`]: amountVal,
      'Status': formatStatusLabel(slip.status),
      'Contribution Date': formatDateStr(slip.createdAt || slip.date || slip.timestamp),
      'Channel / Method': slip.entryMethod ? slip.entryMethod.replace(/_/g, ' ').toUpperCase() : 'DIRECT DEPOSIT',
      'Batch Reference': slip.batchTitle || slip.batchId || '—',
      'Recorded By': recordedBy,
      'Senior Reviewed By': seniorReviewer,
      'Senior Review Date': seniorReviewDate,
      'Reviewer': reviewer,
      'Review Date': reviewDate,
      'Approved By': approver,
      'Approval Date': approveDate,
      'Proof Slip URL': slip.proofUrl || '—',
      'Justification / Notes': slip.justification || slip.notes || '—',
      'Rejection Reason': slip.rejectionReason || '—',
    };
  });

  const wsLedger = XLSX.utils.json_to_sheet(ledgerRows.length > 0 ? ledgerRows : [{ 'Notice': 'No contribution records matching the current filter.' }]);
  wsLedger['!cols'] = [
    { wch: 6 },  // No.
    { wch: 24 }, // Transaction Ref
    { wch: 26 }, // Member Name
    { wch: 28 }, // Member Email
    { wch: 18 }, // Phone Number
    { wch: 18 }, // Member Role
    { wch: 18 }, // Period
    { wch: 16 }, // Amount
    { wch: 26 }, // Status
    { wch: 20 }, // Date
    { wch: 18 }, // Method
    { wch: 22 }, // Batch Ref
    { wch: 20 }, // Recorded By
    { wch: 22 }, // Senior Reviewer
    { wch: 18 }, // Senior Review Date
    { wch: 22 }, // Reviewer
    { wch: 18 }, // Review Date
    { wch: 22 }, // Approved By
    { wch: 18 }, // Approval Date
    { wch: 40 }, // Proof Slip URL
    { wch: 35 }, // Notes
    { wch: 30 }, // Rejection Reason
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Contributions_Ledger');

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: MEMBER SUMMARY (AGGREGATION)
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMemberSummary) {
    const memberAggMap = new Map<string, {
      memberId: string;
      name: string;
      email: string;
      phone: string;
      role: string;
      totalCount: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      approvedAmount: number;
      pendingAmount: number;
      totalAmount: number;
      latestDate: Date | null;
      latestPeriod: string;
    }>();

    slips.forEach(slip => {
      const mid = slip.memberId || 'unassigned';
      const m = getMember(mid);
      const name = m?.name || m?.displayName || slip.memberName || mid;
      const email = m?.email || slip.memberEmail || '—';
      const phone = m?.phone || m?.phoneNumber || '—';
      const role = formatRoleLabel(m?.role);
      const amount = Number(slip.amount) || 0;
      const isApproved = slip.status === 'approved' || slip.status === 'verified';
      const isPending = !isApproved && slip.status !== 'rejected' && slip.status !== 'reversed';
      const isRejected = slip.status === 'rejected' || slip.status === 'reversed';
      const itemDate = safeDate(slip.createdAt || slip.date || slip.timestamp);

      if (!memberAggMap.has(mid)) {
        memberAggMap.set(mid, {
          memberId: mid,
          name,
          email,
          phone,
          role,
          totalCount: 0,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          totalAmount: 0,
          latestDate: itemDate,
          latestPeriod: slip.period || 'General',
        });
      }

      const agg = memberAggMap.get(mid)!;
      agg.totalCount += 1;
      agg.totalAmount += amount;
      if (isApproved) {
        agg.approvedCount += 1;
        agg.approvedAmount += amount;
      } else if (isPending) {
        agg.pendingCount += 1;
        agg.pendingAmount += amount;
      } else if (isRejected) {
        agg.rejectedCount += 1;
      }

      if (itemDate && (!agg.latestDate || itemDate.getTime() > agg.latestDate.getTime())) {
        agg.latestDate = itemDate;
        if (slip.period) agg.latestPeriod = slip.period;
      }
    });

    const summaryRows = Array.from(memberAggMap.values())
      .sort((a, b) => b.approvedAmount - a.approvedAmount)
      .map((row, idx) => ({
        'Rank': idx + 1,
        'Member Name': row.name,
        'Member Email': row.email,
        'Phone Number': row.phone,
        'Role': row.role,
        'Total Deposits': row.totalCount,
        'Approved Deposits': row.approvedCount,
        'Pending Deposits': row.pendingCount,
        [`Verified Savings (${currency})`]: row.approvedAmount,
        [`Pending Amount (${currency})`]: row.pendingAmount,
        [`Cumulative Total (${currency})`]: row.totalAmount,
        'Latest Contribution Date': row.latestDate ? format(row.latestDate, 'yyyy-MM-dd') : '—',
        'Latest Period': row.latestPeriod,
      }));

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length > 0 ? summaryRows : [{ 'Notice': 'No members found.' }]);
    wsSummary['!cols'] = [
      { wch: 6 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Member_Summary');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 3: PERIOD BREAKDOWN
  // ───────────────────────────────────────────────────────────────────────────
  if (includePeriodSummary) {
    const periodMap = new Map<string, {
      period: string;
      totalCount: number;
      approvedCount: number;
      pendingCount: number;
      approvedAmount: number;
      pendingAmount: number;
      totalAmount: number;
    }>();

    slips.forEach(slip => {
      const p = slip.period?.trim() || 'General';
      const amount = Number(slip.amount) || 0;
      const isApproved = slip.status === 'approved' || slip.status === 'verified';
      const isPending = !isApproved && slip.status !== 'rejected' && slip.status !== 'reversed';

      if (!periodMap.has(p)) {
        periodMap.set(p, {
          period: p,
          totalCount: 0,
          approvedCount: 0,
          pendingCount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          totalAmount: 0,
        });
      }

      const agg = periodMap.get(p)!;
      agg.totalCount += 1;
      agg.totalAmount += amount;
      if (isApproved) {
        agg.approvedCount += 1;
        agg.approvedAmount += amount;
      } else if (isPending) {
        agg.pendingCount += 1;
        agg.pendingAmount += amount;
      }
    });

    const periodRows = Array.from(periodMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(row => ({
        'Contribution Period': row.period,
        'Transactions Count': row.totalCount,
        'Approved Transactions': row.approvedCount,
        'Pending Transactions': row.pendingCount,
        [`Approved Total (${currency})`]: row.approvedAmount,
        [`Pending Total (${currency})`]: row.pendingAmount,
        [`Total Amount (${currency})`]: row.totalAmount,
      }));

    const wsPeriod = XLSX.utils.json_to_sheet(periodRows.length > 0 ? periodRows : [{ 'Notice': 'No period data available.' }]);
    wsPeriod['!cols'] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 22 },
      { wch: 20 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPeriod, 'Period_Breakdown');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 4: BATCHES LEDGER (OPTIONAL)
  // ───────────────────────────────────────────────────────────────────────────
  if (includeBatches && batches.length > 0) {
    const batchRows = batches.map((batch, index) => ({
      'No.': index + 1,
      'Batch ID': batch.id || batch.batchId || `BATCH-${index + 1}`,
      'Batch Title': batch.title || 'Source Deductions Batch',
      'Period': batch.defaultPeriod || '—',
      'Initiated By': batch.initiatorName || '—',
      'Initiator Role': formatRoleLabel(batch.initiatorRole),
      [`Total Amount (${currency})`]: Number(batch.totalAmount) || 0,
      'Members Count': batch.totalCount || batch.items?.length || 0,
      'Status': formatStatusLabel(batch.status),
      'Initiated Date': formatDateStr(batch.initiatedAt || batch.createdAt),
      'Reviewed By': batch.reviewedByName || '—',
      'Approved By': batch.approvedByName || '—',
      'Approval Notes': batch.approvalNotes || batch.reviewNotes || '—',
    }));

    const wsBatches = XLSX.utils.json_to_sheet(batchRows);
    wsBatches['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 30 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 24 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 35 },
    ];
    XLSX.utils.book_append_sheet(wb, wsBatches, 'Batches_Ledger');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 5: REPORT METADATA & AUDIT LOG
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMetadata) {
    const totalSlipsAmount = slips.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const approvedAmount = slips
      .filter(s => s.status === 'approved' || s.status === 'verified')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const pendingAmount = slips
      .filter(s => s.status !== 'approved' && s.status !== 'verified' && s.status !== 'rejected' && s.status !== 'reversed')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const metadataAoa = [
      ['IKIMINA SAVINGS & CREDIT GROUP — OFFICIAL CONTRIBUTIONS REGISTER'],
      ['Institutional Financial Reporting & Dual-Control Audit Export'],
      [''],
      ['PARAMETER', 'VALUE'],
      ['Report Generation Date', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Exported By (Officer)', exportedByName],
      ['Officer Email', exportedByEmail || '—'],
      ['Officer Authority / Role', formatRoleLabel(exportedByRole)],
      ['Report Filter Scope', scopeLabel],
      ['Operating Currency', currency],
      ['Total Deposit Slips Exported', slips.length],
      ['Total Contribution Batches Exported', batches.length],
      [`Verified / Committed Savings (${currency})`, approvedAmount],
      [`Pending / Under Review Volume (${currency})`, pendingAmount],
      [`Cumulative Financial Volume (${currency})`, totalSlipsAmount],
      [''],
      ['REGULATORY & AUDIT COMPLIANCE STATEMENT:'],
      ['1. Dual-Control Verification: Individual slips and staff batch deductions are reviewed by Senior Accountants/Compliance Reviewers and ratified by Super Administrators before ledger entry.'],
      ['2. Segregation of Duties: Officers cannot approve their own submissions.'],
      ['3. This Excel document is an authoritative export generated directly from the cryptographic Firestore audit store.'],
    ];

    const wsMeta = XLSX.utils.aoa_to_sheet(metadataAoa);
    wsMeta['!cols'] = [{ wch: 35 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Report_Overview');
  }

  const timestampStr = format(new Date(), 'yyyyMMdd_HHmm');
  const sanitizedScope = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const finalFileName = options.fileName || `Ikimina_Contributions_${sanitizedScope}_${timestampStr}.xlsx`;

  XLSX.writeFile(wb, finalFileName);

  return {
    success: true,
    totalExported: slips.length,
    fileName: finalFileName,
  };
}
