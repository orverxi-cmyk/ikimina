import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const AUTHORIZED_MEMBERS_EXPORT_ROLES = [
  'admin',
  'management',
  'accountant',
  'senior_accountant',
  'reviewer',
] as const;

export function canExportMembers(
  userRole?: string | null,
  userEmail?: string | null
): boolean {
  if (!userRole && !userEmail) return false;
  if (userEmail && userEmail.toLowerCase() === 'tharushyamagara@gmail.com') {
    return true;
  }
  if (!userRole) return false;
  const normalized = userRole.toLowerCase().trim();
  return (AUTHORIZED_MEMBERS_EXPORT_ROLES as readonly string[]).includes(normalized);
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
    member: 'General Member',
  };
  return map[role.toLowerCase()] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatMemberStatus(status?: string): string {
  if (!status) return 'Active';
  const map: Record<string, string> = {
    active: 'Active Member',
    pending: 'Pending Verification',
    suspended: 'Suspended / Deactivated',
    inactive: 'Inactive / Exited',
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

export interface MemberExportItem {
  id: string;
  name?: string;
  firstName?: string;
  surname?: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  idNumber?: string;
  role?: string;
  status?: string;
  joinedAt?: any;
  createdAt?: any;
  totalSavings?: number | string;
  savingsBalance?: number | string;
  sharesCount?: number | string;
  shares?: number | string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelation?: string;
  address?: string;
  [key: string]: any;
}

export interface ExportMembersOptions {
  members: MemberExportItem[];
  currency?: string;
  roleFilter?: string;
  statusFilter?: string;
  exportedByName?: string;
  exportedByEmail?: string;
  exportedByRole?: string;
  fileName?: string;
  scopeLabel?: string;
  includeRoleSummary?: boolean;
  includeStatusSummary?: boolean;
  includeMetadata?: boolean;
}

/**
 * Generates and downloads an institutional Members Directory Excel workbook (.xlsx)
 * with complete member profiles, role classifications, savings metrics, and audit metadata.
 */
export function exportMembersToExcel(options: ExportMembersOptions): {
  success: boolean;
  totalExported: number;
  fileName: string;
} {
  const {
    members,
    currency = 'RWF',
    roleFilter = 'all',
    statusFilter = 'all',
    exportedByName = 'Authorized Finance Officer',
    exportedByEmail = '',
    exportedByRole = 'Administrator',
    scopeLabel = 'Complete Members Register',
    includeRoleSummary = true,
    includeStatusSummary = true,
    includeMetadata = true,
  } = options;

  // Filter members according to options
  let filtered = [...members];

  if (roleFilter !== 'all') {
    filtered = filtered.filter(m => (m.role || 'member').toLowerCase() === roleFilter.toLowerCase());
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter(m => (m.status || 'active').toLowerCase() === statusFilter.toLowerCase());
  }

  const wb = XLSX.utils.book_new();

  // SHEET 1: Registered Members
  const memberRows = filtered.map((m, idx) => {
    const fullName = m.name || `${m.firstName || ''} ${m.surname || ''}`.trim() || '—';
    const savings = Number(m.totalSavings || m.savingsBalance || 0);
    const shares = Number(m.sharesCount || m.shares || 0);

    return {
      '#': idx + 1,
      'Member ID': m.id ? m.id.slice(0, 10).toUpperCase() : '—',
      'Full Name': fullName,
      'Email Address': m.email || '—',
      'Phone Number': m.phone || '—',
      'National ID / Passport': m.nationalId || m.idNumber || '—',
      'System Role': formatRoleLabel(m.role),
      'Account Status': formatMemberStatus(m.status),
      'Date Joined': formatDateStr(m.joinedAt || m.createdAt, 'dd MMM yyyy, HH:mm'),
      [`Total Verified Savings (${currency})`]: savings,
      'Shares Owned': shares,
      'Next of Kin Name': m.nextOfKinName || '—',
      'Next of Kin Phone': m.nextOfKinPhone || '—',
      'Next of Kin Relationship': m.nextOfKinRelation || '—',
      'Residential Address': m.address || '—',
    };
  });

  const wsMembers = XLSX.utils.json_to_sheet(memberRows);

  // Auto-fit column widths
  wsMembers['!cols'] = [
    { wch: 5 },   // #
    { wch: 14 },  // Member ID
    { wch: 25 },  // Full Name
    { wch: 28 },  // Email
    { wch: 16 },  // Phone
    { wch: 20 },  // National ID
    { wch: 22 },  // System Role
    { wch: 22 },  // Account Status
    { wch: 20 },  // Date Joined
    { wch: 26 },  // Total Savings
    { wch: 14 },  // Shares Owned
    { wch: 22 },  // Next of Kin Name
    { wch: 18 },  // Next of Kin Phone
    { wch: 22 },  // Next of Kin Relationship
    { wch: 28 },  // Address
  ];

  XLSX.utils.book_append_sheet(wb, wsMembers, 'Registered_Members');

  // SHEET 2: Role Distribution Summary
  if (includeRoleSummary) {
    const roleMap: Record<string, { count: number; totalSavings: number; totalShares: number }> = {};

    filtered.forEach(m => {
      const r = formatRoleLabel(m.role);
      const savings = Number(m.totalSavings || m.savingsBalance || 0);
      const shares = Number(m.sharesCount || m.shares || 0);

      if (!roleMap[r]) {
        roleMap[r] = { count: 0, totalSavings: 0, totalShares: 0 };
      }
      roleMap[r].count += 1;
      roleMap[r].totalSavings += savings;
      roleMap[r].totalShares += shares;
    });

    const roleSummaryRows = Object.entries(roleMap).map(([roleName, stats]) => ({
      'System Role': roleName,
      'Member Count': stats.count,
      'Share of Total (%)': ((stats.count / Math.max(1, filtered.length)) * 100).toFixed(1) + '%',
      [`Total Combined Savings (${currency})`]: stats.totalSavings,
      'Total Shares Owned': stats.totalShares,
    }));

    const wsRole = XLSX.utils.json_to_sheet(roleSummaryRows);
    wsRole['!cols'] = [
      { wch: 25 },
      { wch: 14 },
      { wch: 18 },
      { wch: 28 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRole, 'Role_Distribution');
  }

  // SHEET 3: Status Breakdown Summary
  if (includeStatusSummary) {
    const statusMap: Record<string, { count: number; totalSavings: number }> = {};

    filtered.forEach(m => {
      const st = formatMemberStatus(m.status);
      const savings = Number(m.totalSavings || m.savingsBalance || 0);

      if (!statusMap[st]) {
        statusMap[st] = { count: 0, totalSavings: 0 };
      }
      statusMap[st].count += 1;
      statusMap[st].totalSavings += savings;
    });

    const statusSummaryRows = Object.entries(statusMap).map(([statusName, stats]) => ({
      'Account Status': statusName,
      'Member Count': stats.count,
      'Percentage (%)': ((stats.count / Math.max(1, filtered.length)) * 100).toFixed(1) + '%',
      [`Combined Savings (${currency})`]: stats.totalSavings,
    }));

    const wsStatus = XLSX.utils.json_to_sheet(statusSummaryRows);
    wsStatus['!cols'] = [
      { wch: 25 },
      { wch: 14 },
      { wch: 16 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsStatus, 'Status_Breakdown');
  }

  // SHEET 4: Export Metadata
  if (includeMetadata) {
    const totalSavingsSum = filtered.reduce((s, m) => s + Number(m.totalSavings || m.savingsBalance || 0), 0);
    const totalSharesSum = filtered.reduce((s, m) => s + Number(m.sharesCount || m.shares || 0), 0);

    const metaRows = [
      { Property: 'Document Title', Value: 'IKIMINA SACCO Registered Members Directory Register' },
      { Property: 'Export Scope / Scope Label', Value: scopeLabel },
      { Property: 'Role Filter Applied', Value: roleFilter === 'all' ? 'All System Roles' : formatRoleLabel(roleFilter) },
      { Property: 'Status Filter Applied', Value: statusFilter === 'all' ? 'All Account Statuses' : formatMemberStatus(statusFilter) },
      { Property: 'Total Member Records', Value: filtered.length },
      { Property: `Total Combined Savings (${currency})`, Value: totalSavingsSum },
      { Property: 'Total Group Shares Owned', Value: totalSharesSum },
      { Property: 'Export Generated By (Name)', Value: exportedByName },
      { Property: 'Export Generated By (Email)', Value: exportedByEmail || 'N/A' },
      { Property: 'Export Officer Role', Value: formatRoleLabel(exportedByRole) },
      { Property: 'System Environment', Value: 'IKIMINA SACCO Financial Management Core' },
      { Property: 'Generation Timestamp', Value: format(new Date(), 'yyyy-MM-dd HH:mm:ss xxxx') },
      { Property: 'Compliance Classification', Value: 'CONFIDENTIAL — Authorized SACCO Dual-Control Sign-Off Required' },
    ];

    const wsMeta = XLSX.utils.json_to_sheet(metaRows);
    wsMeta['!cols'] = [{ wch: 32 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Export_Metadata');
  }

  const generatedFileName = options.fileName || `IKIMINA_Members_Directory_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
  XLSX.writeFile(wb, generatedFileName);

  return {
    success: true,
    totalExported: filtered.length,
    fileName: generatedFileName,
  };
}
