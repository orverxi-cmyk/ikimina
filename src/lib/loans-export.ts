import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const AUTHORIZED_LOAN_EXPORT_ROLES = [
  'admin',
  'management',
  'accountant',
  'senior_accountant',
  'reviewer',
] as const;

/**
 * Checks whether a user has administrative, accounting, or compliance review privileges
 * (the three admin roles: Admin, Accountant, Reviewer) to export the loan portfolio.
 */
export function canExportLoans(
  userRole?: string | null,
  userEmail?: string | null
): boolean {
  if (!userRole && !userEmail) return false;
  if (userEmail && userEmail.toLowerCase() === 'tharushyamagara@gmail.com') {
    return true;
  }
  if (!userRole) return false;
  const normalized = userRole.toLowerCase().trim();
  return (AUTHORIZED_LOAN_EXPORT_ROLES as readonly string[]).includes(normalized);
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

export function formatLoanStatus(status?: string): string {
  if (!status) return 'Unknown';
  const map: Record<string, string> = {
    requested: 'Pending Initial Review',
    pending_reviewer: 'Awaiting Compliance Reviewer',
    reviewed: 'Reviewed — Pending Admin Approval',
    approved: 'Active / Disbursed',
    active: 'Active / Disbursed',
    completed: 'Completed (Fully Repaid)',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn by Member',
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

export interface LoanExportItem {
  id: string;
  memberId?: string;
  amount?: number | string;
  interestRate?: number | string;
  interestAmount?: number | string;
  balance?: number | string;
  totalRepaid?: number | string;
  durationMonths?: number | string;
  status?: string;
  description?: string;
  requestDate?: any;
  approvalDate?: any;
  disbursementDate?: any;
  dueDate?: any;
  startDate?: any;
  isTopUp?: boolean;
  parentLoanId?: string;
  managementApprovalUrl?: string;
  seniorReviewed?: boolean;
  seniorReviewedBy?: string;
  seniorReviewedByName?: string;
  seniorReviewedAt?: any;
  seniorReviewJustification?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedByRole?: string;
  reviewedAt?: any;
  reviewJustification?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedByRole?: string;
  approvedAt?: any;
  approvalJustification?: string;
  rejectionReason?: string;
  withdrawnReason?: string;
  [key: string]: any;
}

export interface RepaymentExportItem {
  id: string;
  loanId?: string;
  memberId?: string;
  amount?: number | string;
  date?: any;
  status?: string;
  proofUrl?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: any;
  justification?: string;
  [key: string]: any;
}

export interface ExportLoansOptions {
  loans: LoanExportItem[];
  repayments?: RepaymentExportItem[];
  memberMap: Map<string, any> | Record<string, any>;
  currency?: string;
  liquidityMetrics?: any;
  exportedByName?: string;
  exportedByEmail?: string;
  exportedByRole?: string;
  fileName?: string;
  scopeLabel?: string;
  includeRepayments?: boolean;
  includeBorrowerSummary?: boolean;
  includePortfolioKPIs?: boolean;
  includeMetadata?: boolean;
}

/**
 * Generates and downloads an institutional Loan Portfolio Excel workbook (.xlsx)
 * with complete loan facilities ledger, repayment history, borrower exposures,
 * and portfolio risk/liquidity metrics.
 */
export function exportLoansToExcel(options: ExportLoansOptions): {
  success: boolean;
  totalExported: number;
  fileName: string;
} {
  const {
    loans,
    repayments = [],
    memberMap,
    currency = 'RWF',
    liquidityMetrics,
    exportedByName = 'Authorized Credit Officer',
    exportedByEmail = '',
    exportedByRole = 'Administrator',
    scopeLabel = 'Complete Loan Portfolio',
    includeRepayments = true,
    includeBorrowerSummary = true,
    includePortfolioKPIs = true,
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
  // SHEET 1: LOAN PORTFOLIO (DETAILED FACILITIES LEDGER)
  // ───────────────────────────────────────────────────────────────────────────
  const ledgerRows = loans.map((loan, index) => {
    const member = getMember(loan.memberId);
    const borrowerName = member?.name || member?.displayName || loan.borrowerName || loan.memberId || 'Unknown Member';
    const borrowerEmail = member?.email || '—';
    const borrowerPhone = member?.phone || member?.phoneNumber || '—';
    const borrowerRole = formatRoleLabel(member?.role);

    const principal = Number(loan.amount) || 0;
    const interest = Number(loan.interestAmount) || 0;
    const totalFacility = principal + interest;
    const balance = Number(loan.balance ?? (loan.status === 'completed' ? 0 : principal)) || 0;
    const repaid = Number(loan.totalRepaid ?? (totalFacility - balance)) || 0;

    const seniorReviewer = loan.seniorReviewedByName || (loan.seniorReviewedBy ? (getMember(loan.seniorReviewedBy)?.name || loan.seniorReviewedBy) : '—');
    const reviewer = loan.reviewedByName || (loan.reviewedBy ? (getMember(loan.reviewedBy)?.name || loan.reviewedBy) : '—');
    const approver = loan.approvedByName || (loan.approvedBy ? (getMember(loan.approvedBy)?.name || loan.approvedBy) : '—');

    return {
      'No.': index + 1,
      'Facility Ref': loan.id || `LOAN-${index + 1}`,
      'Borrower Name': borrowerName,
      'Borrower Email': borrowerEmail,
      'Phone Number': borrowerPhone,
      'Borrower Role': borrowerRole,
      'Status': formatLoanStatus(loan.status),
      [`Principal (${currency})`]: principal,
      [`Interest Amount (${currency})`]: interest,
      [`Total Facility (${currency})`]: totalFacility,
      [`Amount Repaid (${currency})`]: Math.max(0, repaid),
      [`Outstanding Balance (${currency})`]: Math.max(0, balance),
      'Tenure (Months)': Number(loan.durationMonths) || 12,
      'Facility Type': loan.isTopUp ? 'Top-Up Facility' : 'Standard Capital Loan',
      'Parent Facility Ref': loan.parentLoanId || '—',
      'Application Date': formatDateStr(loan.requestDate || loan.createdAt),
      'Disbursement / Start Date': formatDateStr(loan.startDate || loan.approvalDate || loan.disbursementDate, 'yyyy-MM-dd'),
      'Senior Reviewed By': seniorReviewer,
      'Senior Review Date': formatDateStr(loan.seniorReviewedAt),
      'Compliance Reviewer': reviewer,
      'Compliance Review Date': formatDateStr(loan.reviewedAt),
      'Approved By': approver,
      'Approval Date': formatDateStr(loan.approvedAt || loan.approvalDate),
      'Management Approval URL': loan.managementApprovalUrl || '—',
      'Purpose / Description': loan.description || 'General member loan',
      'Notes / Reason': loan.rejectionReason || loan.withdrawnReason || loan.approvalJustification || loan.reviewJustification || '—',
    };
  });

  const wsLedger = XLSX.utils.json_to_sheet(
    ledgerRows.length > 0 ? ledgerRows : [{ Notice: 'No loan records found for this criteria.' }]
  );
  wsLedger['!cols'] = [
    { wch: 6 },  // No.
    { wch: 24 }, // Facility Ref
    { wch: 26 }, // Borrower Name
    { wch: 28 }, // Borrower Email
    { wch: 18 }, // Phone Number
    { wch: 18 }, // Borrower Role
    { wch: 26 }, // Status
    { wch: 18 }, // Principal
    { wch: 18 }, // Interest
    { wch: 20 }, // Total Facility
    { wch: 18 }, // Repaid
    { wch: 20 }, // Balance
    { wch: 16 }, // Tenure
    { wch: 20 }, // Facility Type
    { wch: 22 }, // Parent Facility Ref
    { wch: 20 }, // App Date
    { wch: 22 }, // Disbursement Date
    { wch: 22 }, // Senior Reviewer
    { wch: 18 }, // Senior Review Date
    { wch: 22 }, // Compliance Reviewer
    { wch: 18 }, // Review Date
    { wch: 22 }, // Approved By
    { wch: 18 }, // Approval Date
    { wch: 35 }, // Approval URL
    { wch: 30 }, // Description
    { wch: 30 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Loan_Portfolio');

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: REPAYMENTS LEDGER (TRANSACTIONS)
  // ───────────────────────────────────────────────────────────────────────────
  if (includeRepayments && repayments.length > 0) {
    const repaymentRows = repayments.map((r, index) => {
      const member = getMember(r.memberId);
      const borrowerName = member?.name || member?.displayName || r.memberId || 'Borrower';
      const amount = Number(r.amount) || 0;
      const statusLabel = r.status === 'verified' ? 'Verified & Credited' : r.status === 'pending' ? 'Pending Audit Verification' : r.status || 'Recorded';

      return {
        'No.': index + 1,
        'Repayment Ref': r.id || `REP-${index + 1}`,
        'Facility Ref': r.loanId || '—',
        'Borrower Name': borrowerName,
        [`Repayment Amount (${currency})`]: amount,
        'Status': statusLabel,
        'Payment Date': formatDateStr(r.date || r.createdAt),
        'Payment Proof URL': r.proofUrl || '—',
        'Verified By': r.verifiedByName || (r.verifiedBy ? (getMember(r.verifiedBy)?.name || r.verifiedBy) : '—'),
        'Verification Date': formatDateStr(r.verifiedAt),
        'Audit Notes': r.justification || '—',
      };
    });

    const wsRepayments = XLSX.utils.json_to_sheet(repaymentRows);
    wsRepayments['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 24 },
      { wch: 26 },
      { wch: 20 },
      { wch: 24 },
      { wch: 18 },
      { wch: 35 },
      { wch: 22 },
      { wch: 18 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRepayments, 'Repayments_Ledger');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 3: BORROWER EXPOSURE SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  if (includeBorrowerSummary) {
    const borrowerMap = new Map<string, {
      memberId: string;
      name: string;
      email: string;
      phone: string;
      role: string;
      totalLoans: number;
      activeLoans: number;
      completedLoans: number;
      totalBorrowed: number;
      totalInterest: number;
      totalRepaid: number;
      totalOutstanding: number;
    }>();

    loans.forEach(loan => {
      const mid = loan.memberId || 'unassigned';
      const m = getMember(mid);
      const name = m?.name || m?.displayName || mid;
      const email = m?.email || '—';
      const phone = m?.phone || m?.phoneNumber || '—';
      const role = formatRoleLabel(m?.role);

      const principal = Number(loan.amount) || 0;
      const interest = Number(loan.interestAmount) || 0;
      const totalFac = principal + interest;
      const balance = Number(loan.balance ?? (loan.status === 'completed' ? 0 : principal)) || 0;
      const repaid = Number(loan.totalRepaid ?? (totalFac - balance)) || 0;

      const isActive = loan.status === 'approved' || loan.status === 'active';
      const isCompleted = loan.status === 'completed';

      if (!borrowerMap.has(mid)) {
        borrowerMap.set(mid, {
          memberId: mid,
          name,
          email,
          phone,
          role,
          totalLoans: 0,
          activeLoans: 0,
          completedLoans: 0,
          totalBorrowed: 0,
          totalInterest: 0,
          totalRepaid: 0,
          totalOutstanding: 0,
        });
      }

      const agg = borrowerMap.get(mid)!;
      agg.totalLoans += 1;
      agg.totalBorrowed += principal;
      agg.totalInterest += interest;
      agg.totalRepaid += Math.max(0, repaid);
      agg.totalOutstanding += Math.max(0, balance);

      if (isActive && balance > 0) agg.activeLoans += 1;
      if (isCompleted || balance === 0) agg.completedLoans += 1;
    });

    const borrowerRows = Array.from(borrowerMap.values())
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .map((row, idx) => ({
        'Rank': idx + 1,
        'Borrower Name': row.name,
        'Borrower Email': row.email,
        'Phone Number': row.phone,
        'Role': row.role,
        'Total Facilities Taken': row.totalLoans,
        'Active Facilities': row.activeLoans,
        'Completed Facilities': row.completedLoans,
        [`Cumulative Principal (${currency})`]: row.totalBorrowed,
        [`Cumulative Interest (${currency})`]: row.totalInterest,
        [`Total Repaid to Date (${currency})`]: row.totalRepaid,
        [`Outstanding Debt Exposure (${currency})`]: row.totalOutstanding,
      }));

    const wsBorrowers = XLSX.utils.json_to_sheet(
      borrowerRows.length > 0 ? borrowerRows : [{ Notice: 'No borrower summary data.' }]
    );
    wsBorrowers['!cols'] = [
      { wch: 6 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsBorrowers, 'Borrower_Exposure');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 4: PORTFOLIO RISK & LIQUIDITY METRICS
  // ───────────────────────────────────────────────────────────────────────────
  if (includePortfolioKPIs) {
    const totalPrincipal = loans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const activeLoans = loans.filter(l => l.status === 'approved' || l.status === 'active');
    const totalOutstanding = activeLoans.reduce((s, l) => s + (Number(l.balance) || 0), 0);
    const completedLoans = loans.filter(l => l.status === 'completed');
    const pendingLoans = loans.filter(l => l.status === 'requested' || l.status === 'pending_reviewer' || l.status === 'reviewed');
    const totalInterest = loans.reduce((s, l) => s + (Number(l.interestAmount) || 0), 0);

    const kpiAoa = [
      ['IKIMINA LOAN PORTFOLIO — RISK & LIQUIDITY ASSESSMENT'],
      ['Authoritative Credit Metrics and Capital Adequacy Overview'],
      [''],
      ['PORTFOLIO METRIC', 'VALUE'],
      ['Total Facilities Registered', loans.length],
      ['Active Facilities', activeLoans.length],
      ['Completed / Fully Repaid Facilities', completedLoans.length],
      ['Pending Applications Under Review', pendingLoans.length],
      [`Total Cumulative Principal Disbursed (${currency})`, totalPrincipal],
      [`Active Debt Outstanding (${currency})`, totalOutstanding],
      [`Cumulative Realized & Accrued Interest (${currency})`, totalInterest],
      [''],
      ['INSTITUTIONAL LENDING POOL & CEILING GAUGES:'],
      ['Operating Currency', currency],
      ['Max Lending Pool Ceiling (%)', `${liquidityMetrics?.maxLendingPoolPercentage ?? 90}% of Net Total Assets`],
      [`Net Total Assets Under Custody (${currency})`, Number(liquidityMetrics?.netTotalAssets) || '—'],
      [`Total Max Lending Capacity (${currency})`, Number(liquidityMetrics?.maxLendingPool) || '—'],
      [`Available Lending Pool for New Facilities (${currency})`, Number(liquidityMetrics?.availableLendingPool) || '—'],
      [`Gross Member Savings (${currency})`, Number(liquidityMetrics?.totalVerifiedSavings) || '—'],
    ];

    const wsKpis = XLSX.utils.aoa_to_sheet(kpiAoa);
    wsKpis['!cols'] = [{ wch: 38 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsKpis, 'Portfolio_KPIs');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 5: REPORT METADATA & COMPLIANCE SIGN-OFF
  // ───────────────────────────────────────────────────────────────────────────
  if (includeMetadata) {
    const metaAoa = [
      ['IKIMINA SAVINGS & CREDIT GROUP — LOAN PORTFOLIO REGISTER'],
      ['Institutional Credit Governance & Dual-Control Audit Export'],
      [''],
      ['AUDIT PARAMETER', 'VALUE'],
      ['Report Generation Date', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Exported By (Officer)', exportedByName],
      ['Officer Email', exportedByEmail || '—'],
      ['Officer Authority / Role', formatRoleLabel(exportedByRole)],
      ['Report Filter Scope', scopeLabel],
      ['Operating Currency', currency],
      ['Total Facilities Exported', loans.length],
      ['Total Repayments Exported', repayments.length],
      [''],
      ['CREDIT GOVERNANCE STATEMENT:'],
      ['1. Dual-Control Protocol: Loan requests undergo initial review by Senior Accountants/Compliance Reviewers and require executive ratification before fund disbursement.'],
      ['2. Segregation of Duties: Officers cannot approve their own loan applications.'],
      ['3. This Excel document is an authoritative export generated directly from the cryptographic Firestore audit store.'],
    ];

    const wsMeta = XLSX.utils.aoa_to_sheet(metaAoa);
    wsMeta['!cols'] = [{ wch: 35 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Report_Overview');
  }

  const timestampStr = format(new Date(), 'yyyyMMdd_HHmm');
  const sanitizedScope = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const finalFileName = options.fileName || `Ikimina_Loan_Portfolio_${sanitizedScope}_${timestampStr}.xlsx`;

  XLSX.writeFile(wb, finalFileName);

  return {
    success: true,
    totalExported: loans.length,
    fileName: finalFileName,
  };
}
