import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const AUTHORIZED_INTEREST_EXPORT_ROLES = [
  'admin',
  'management',
  'accountant',
  'senior_accountant',
  'reviewer',
] as const;

/**
 * Checks whether a user has administrative, accounting, or compliance review privileges
 * (the three admin roles: Admin, Accountant, Reviewer) to export interest distribution data.
 */
export function canExportInterest(
  userRole?: string | null,
  userEmail?: string | null
): boolean {
  if (!userRole && !userEmail) return false;
  if (userEmail && userEmail.toLowerCase() === 'tharushyamagara@gmail.com') {
    return true;
  }
  if (!userRole) return false;
  const normalized = userRole.toLowerCase().trim();
  return (AUTHORIZED_INTEREST_EXPORT_ROLES as readonly string[]).includes(normalized);
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

export function formatProposalStatus(status?: string): string {
  if (!status) return 'Unknown';
  const map: Record<string, string> = {
    pending: 'Pending Initial Review',
    pending_reviewer: 'Awaiting Compliance Reviewer',
    pending_approval: 'Awaiting Executive Approval',
    approved: 'Approved & Committed to Ledger',
    rejected: 'Rejected',
    revision_requested: 'Revision Requested',
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

export interface InterestRunItem {
  id: string;
  totalDistributed?: number | string;
  amountDistributed?: number | string;
  totalInterestToDistribute?: number | string;
  totalCapitalizedToContributions?: number | string;
  totalCashPayout?: number | string;
  capitalizedCount?: number;
  cashPayoutCount?: number;
  recipientsCount?: number;
  distributedAt?: any;
  createdAt?: any;
  distributedBy?: string;
  distributedByName?: string;
  initiatedBy?: string;
  initiatedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  justification?: string;
  notes?: string;
  approvalNotes?: string;
  breakdown?: any[];
  [key: string]: any;
}

export interface InterestProposalItem {
  id: string;
  totalInterestToDistribute?: number | string;
  amountDistributed?: number | string;
  status?: string;
  createdAt?: any;
  period?: string;
  recipientsCount?: number;
  initiatedBy?: string;
  initiatedByName?: string;
  adminName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  justification?: string;
  reviewNotes?: string;
  approvalNotes?: string;
  breakdown?: any[];
  [key: string]: any;
}

export interface ExportInterestOptions {
  runs: InterestRunItem[];
  proposals?: InterestProposalItem[];
  memberMap: Map<string, any> | Record<string, any>;
  currency?: string;
  poolMetrics?: {
    totalRealizedInterest?: number;
    lifetimeDistributedInterest?: number;
    availableUndistributedInterest?: number;
    totalVerifiedSavings?: number;
    activeSaversCount?: number;
  };
  selectedRunId?: string;
  channelFilter?: string;
  memberFilter?: string;
  exportedByName?: string;
  exportedByEmail?: string;
  exportedByRole?: string;
  fileName?: string;
  scopeLabel?: string;
  includeAllocationsDetail?: boolean;
  includeMemberSummary?: boolean;
  includeProposals?: boolean;
  includePoolKPIs?: boolean;
  includeMetadata?: boolean;
}

/**
 * Generates and downloads an institutional Excel workbook (.xlsx) for Interest Distribution
 * including historical distribution runs, member-by-member allocations breakdown,
 * lifetime dividend totals per member, proposals queue, and pool metrics.
 */
export function exportInterestToExcel(options: ExportInterestOptions): {
  success: boolean;
  totalRunsExported: number;
  totalAllocationsExported: number;
  fileName: string;
} {
  const {
    runs,
    proposals = [],
    memberMap,
    currency = 'RWF',
    poolMetrics,
    selectedRunId = 'all',
    channelFilter = 'all',
    memberFilter = 'all',
    exportedByName = 'Authorized Finance Officer',
    exportedByEmail = '',
    exportedByRole = 'Administrator',
    scopeLabel = 'Comprehensive Interest Register',
    includeAllocationsDetail = true,
    includeMemberSummary = true,
    includeProposals = true,
    includePoolKPIs = true,
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

  // Filter runs if specific run chosen
  const targetRuns = selectedRunId === 'all'
    ? runs
    : runs.filter(r => r.id === selectedRunId);

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: HISTORICAL RUNS LEDGER
  // ───────────────────────────────────────────────────────────────────────────
  const runRows = targetRuns.map((run, index) => {
    const totalDist = Number(run.amountDistributed || run.totalDistributed || run.totalInterestToDistribute) || 0;
    const capitalized = Number(run.totalCapitalizedToContributions) || 0;
    const cash = Number(run.totalCashPayout) || 0;

    return {
      'No.': index + 1,
      'Run ID': run.id || `RUN-${index + 1}`,
      'Distribution Date': formatDateStr(run.distributedAt || run.createdAt),
      [`Total Distributed (${currency})`]: totalDist,
      [`Reinvested to Savings (${currency})`]: capitalized,
      'Reinvested Savers Count': run.capitalizedCount || 0,
      [`Liquid Cash Payouts (${currency})`]: cash,
      'Cash Payout Savers Count': run.cashPayoutCount || 0,
      'Total Recipients': run.recipientsCount || run.breakdown?.length || 0,
      'Initiated By': run.initiatedByName || '—',
      'Reviewed By': run.reviewedByName || '—',
      'Approved By': run.distributedByName || run.approvedByName || '—',
      'Approval / Audit Notes': run.approvalNotes || run.justification || run.notes || '—',
    };
  });

  const wsRuns = XLSX.utils.json_to_sheet(
    runRows.length > 0 ? runRows : [{ Notice: 'No historical distribution runs found for this criteria.' }]
  );
  wsRuns['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRuns, 'Historical_Runs');

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: MEMBER ALLOCATIONS DETAIL
  // ───────────────────────────────────────────────────────────────────────────
  let totalAllocationsCount = 0;
  if (includeAllocationsDetail) {
    const allocationRows: Record<string, any>[] = [];

    targetRuns.forEach(run => {
      const breakdown = Array.isArray(run.breakdown) ? run.breakdown : [];
      const runDateStr = formatDateStr(run.distributedAt || run.createdAt, 'yyyy-MM-dd');
      const runRef = run.id ? run.id.slice(0, 10) : 'RUN';

      breakdown.forEach((item: any, idx: number) => {
        const mid = item.memberId || item.id || `M-${idx}`;
        const m = getMember(mid);
        const memberName = item.memberName || item.name || m?.name || m?.displayName || mid;
        const memberEmail = item.memberEmail || item.email || m?.email || '—';
        const memberPhone = m?.phone || m?.phoneNumber || '—';

        const pref = item.payoutPreference || item.preference || (item.payoutAmount > 0 ? 'receive_payout' : 'add_to_contribution');
        const channelLabel = pref === 'receive_payout' ? 'Liquid Cash Payout' : 'Reinvested to Savings';

        // Filtering by member
        if (memberFilter !== 'all' && mid !== memberFilter) return;

        // Filtering by channel
        if (channelFilter === 'capitalized' && pref !== 'add_to_contribution') return;
        if (channelFilter === 'cash' && pref !== 'receive_payout') return;

        const allocatedAmt = Number(item.allocatedAmount ?? item.amount ?? item.dividend) || 0;
        const savingsAtRun = Number(item.memberSavings ?? item.contributions ?? item.savings) || 0;
        const shareRatio = item.sharePercentage ?? item.percentage ?? '—';
        const ratioStr = typeof shareRatio === 'number' ? `${shareRatio.toFixed(2)}%` : String(shareRatio);

        const capAmt = Number(item.capitalizedAmount ?? (pref === 'add_to_contribution' ? allocatedAmt : 0)) || 0;
        const cashAmt = Number(item.payoutAmount ?? (pref === 'receive_payout' ? allocatedAmt : 0)) || 0;

        allocationRows.push({
          'Run Ref': runRef,
          'Run Date': runDateStr,
          'Member Name': memberName,
          'Member Email': memberEmail,
          'Phone Number': memberPhone,
          [`Savings at Calculation (${currency})`]: savingsAtRun,
          'Pro-Rata Weight': ratioStr,
          [`Dividend Allocated (${currency})`]: allocatedAmt,
          'Payout Channel': channelLabel,
          [`Capitalized to Savings (${currency})`]: capAmt,
          [`Cash Disbursed (${currency})`]: cashAmt,
          'Disbursement Status': item.payoutStatus || item.status || 'Settled / Credited',
        });
      });
    });

    totalAllocationsCount = allocationRows.length;

    const wsAllocations = XLSX.utils.json_to_sheet(
      allocationRows.length > 0 ? allocationRows : [{ Notice: 'No member allocation records matching this filter.' }]
    );
    wsAllocations['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAllocations, 'Allocations_Detail');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 3: MEMBER LIFETIME DIVIDENDS (AGGREGATE)
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMemberSummary) {
    const memberAggMap = new Map<string, {
      memberId: string;
      name: string;
      email: string;
      phone: string;
      role: string;
      totalRunsParticipated: number;
      totalDividendEarned: number;
      totalCapitalized: number;
      totalCashPayout: number;
    }>();

    runs.forEach(run => {
      const breakdown = Array.isArray(run.breakdown) ? run.breakdown : [];
      breakdown.forEach((item: any, idx: number) => {
        const mid = item.memberId || item.id || `M-${idx}`;
        const m = getMember(mid);
        const name = item.memberName || item.name || m?.name || mid;
        const email = item.memberEmail || item.email || m?.email || '—';
        const phone = m?.phone || m?.phoneNumber || '—';
        const role = formatRoleLabel(m?.role);

        const allocatedAmt = Number(item.allocatedAmount ?? item.amount ?? item.dividend) || 0;
        const pref = item.payoutPreference || item.preference || (item.payoutAmount > 0 ? 'receive_payout' : 'add_to_contribution');
        const capAmt = Number(item.capitalizedAmount ?? (pref === 'add_to_contribution' ? allocatedAmt : 0)) || 0;
        const cashAmt = Number(item.payoutAmount ?? (pref === 'receive_payout' ? allocatedAmt : 0)) || 0;

        if (!memberAggMap.has(mid)) {
          memberAggMap.set(mid, {
            memberId: mid,
            name,
            email,
            phone,
            role,
            totalRunsParticipated: 0,
            totalDividendEarned: 0,
            totalCapitalized: 0,
            totalCashPayout: 0,
          });
        }

        const agg = memberAggMap.get(mid)!;
        agg.totalRunsParticipated += 1;
        agg.totalDividendEarned += allocatedAmt;
        agg.totalCapitalized += capAmt;
        agg.totalCashPayout += cashAmt;
      });
    });

    const memberSummaryRows = Array.from(memberAggMap.values())
      .sort((a, b) => b.totalDividendEarned - a.totalDividendEarned)
      .map((row, idx) => ({
        'Rank': idx + 1,
        'Member Name': row.name,
        'Member Email': row.email,
        'Phone Number': row.phone,
        'Role': row.role,
        'Distributions Count': row.totalRunsParticipated,
        [`Cumulative Dividends (${currency})`]: row.totalDividendEarned,
        [`Reinvested in Savings (${currency})`]: row.totalCapitalized,
        [`Withdrawn as Cash (${currency})`]: row.totalCashPayout,
      }));

    const wsMemberSummary = XLSX.utils.json_to_sheet(
      memberSummaryRows.length > 0 ? memberSummaryRows : [{ Notice: 'No member lifetime dividend history.' }]
    );
    wsMemberSummary['!cols'] = [
      { wch: 6 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 24 },
      { wch: 24 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMemberSummary, 'Member_Dividends_Summary');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 4: PROPOSALS QUEUE
  // ───────────────────────────────────────────────────────────────────────────
  if (includeProposals && proposals.length > 0) {
    const proposalRows = proposals.map((prop, idx) => ({
      'No.': idx + 1,
      'Proposal ID': prop.id || `PROP-${idx + 1}`,
      'Period': prop.period || 'General',
      'Created Date': formatDateStr(prop.createdAt),
      [`Proposed Pool (${currency})`]: Number(prop.totalInterestToDistribute || prop.amountDistributed) || 0,
      'Eligible Savers': prop.recipientsCount || prop.breakdown?.length || 0,
      'Status': formatProposalStatus(prop.status),
      'Initiated By': prop.initiatedByName || prop.adminName || '—',
      'Reviewed By': prop.reviewedByName || '—',
      'Approved By': prop.approvedByName || '—',
      'Justification': prop.justification || '—',
      'Review Notes': prop.reviewNotes || '—',
      'Approval Notes': prop.approvalNotes || '—',
    }));

    const wsProps = XLSX.utils.json_to_sheet(proposalRows);
    wsProps['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 22 },
      { wch: 16 },
      { wch: 26 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsProps, 'Proposals_Queue');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 5: POOL METRICS & LIQUIDITY
  // ───────────────────────────────────────────────────────────────────────────
  if (includePoolKPIs) {
    const totalRunsDistributed = runs.reduce((s, r) => s + (Number(r.amountDistributed || r.totalDistributed) || 0), 0);
    const totalRunsCapitalized = runs.reduce((s, r) => s + (Number(r.totalCapitalizedToContributions) || 0), 0);
    const totalRunsCash = runs.reduce((s, r) => s + (Number(r.totalCashPayout) || 0), 0);

    const kpiAoa = [
      ['IKIMINA INTEREST DISTRIBUTION — PROFIT POOL & METRICS'],
      ['Group Loan Realized Profit, Safe Lending Allocation & Cumulative Dividends'],
      [''],
      ['FINANCIAL METRIC', 'VALUE'],
      ['Operating Currency', currency],
      [`Lifetime Realized Loan Interest (${currency})`, poolMetrics?.totalRealizedInterest ?? '—'],
      [`Lifetime Distributed Interest (${currency})`, poolMetrics?.lifetimeDistributedInterest ?? '—'],
      [`Available Undistributed Profit Pool (${currency})`, poolMetrics?.availableUndistributedInterest ?? '—'],
      [`Total Verified Scheme Savings (${currency})`, poolMetrics?.totalVerifiedSavings ?? '—'],
      ['Eligible Active Savers Count', poolMetrics?.activeSaversCount ?? '—'],
      [''],
      ['HISTORICAL DISTRIBUTION PERFORMANCE:'],
      ['Total Completed Distribution Runs', runs.length],
      [`Cumulative Profit Allocated to Members (${currency})`, totalRunsDistributed],
      [`Cumulative Reinvested into Member Savings (${currency})`, totalRunsCapitalized],
      [`Cumulative Sent as Liquid Cash Payouts (${currency})`, totalRunsCash],
      ['Pro-Rata Formula', 'Member Dividend = (Member Verified Savings / Total Scheme Savings) * Target Pool Amount'],
    ];

    const wsKpis = XLSX.utils.aoa_to_sheet(kpiAoa);
    wsKpis['!cols'] = [{ wch: 40 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsKpis, 'Profit_Pool_KPIs');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 6: REPORT METADATA & DUAL-CONTROL AUDIT TRAIL
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMetadata) {
    const metaAoa = [
      ['IKIMINA SAVINGS & CREDIT GROUP — INTEREST DISTRIBUTION REGISTER'],
      ['Official Institutional Dividend Ledger & Dual-Control Audit Export'],
      [''],
      ['AUDIT PARAMETER', 'VALUE'],
      ['Report Generation Date', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Exported By (Officer)', exportedByName],
      ['Officer Email', exportedByEmail || '—'],
      ['Officer Authority / Role', formatRoleLabel(exportedByRole)],
      ['Report Filter Scope', scopeLabel],
      ['Operating Currency', currency],
      ['Historical Runs Exported', targetRuns.length],
      ['Allocations Records Exported', totalAllocationsCount],
      ['Proposals Exported', proposals.length],
      [''],
      ['DUAL-CONTROL & REGULATORY COMPLIANCE STATEMENT:'],
      ['1. Dual-Control Protocol: Interest distribution proposals are initiated by Accountants/Senior Accountants, endorsed by Reviewers, and ratified by Super Administrators before ledger posting.'],
      ['2. Segregation of Duties: Officers initiating distribution campaigns are prohibited from approving them.'],
      ['3. Pro-Rata Integrity: Member payouts are calculated cryptographically using authoritative verified savings weights at the time of distribution.'],
    ];

    const wsMeta = XLSX.utils.aoa_to_sheet(metaAoa);
    wsMeta['!cols'] = [{ wch: 35 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Report_Overview');
  }

  const timestampStr = format(new Date(), 'yyyyMMdd_HHmm');
  const sanitizedScope = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const finalFileName = options.fileName || `Ikimina_Interest_Distribution_${sanitizedScope}_${timestampStr}.xlsx`;

  XLSX.writeFile(wb, finalFileName);

  return {
    success: true,
    totalRunsExported: targetRuns.length,
    totalAllocationsExported: totalAllocationsCount,
    fileName: finalFileName,
  };
}
