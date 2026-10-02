import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export interface RegisteredMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  avatarUrl?: string;
}

export interface ParsedContributionRow {
  rowNumber: number;
  staffEmail: string;
  staffName: string;
  phone: string;
  amount: number;
  period: string;
  deductionDate: string;
  notes: string;
  // Matching and validation state
  status: 'valid' | 'unmatched' | 'invalid_amount';
  matchedMember?: RegisteredMember;
  memberId?: string;
  errorMessage?: string;
}

export interface ParseResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  unmatchedRows: number;
  invalidAmountRows: number;
  totalAmount: number;
  rows: ParsedContributionRow[];
  detectedPeriod?: string;
}

/**
 * Downloads a professionally formatted Excel (.xlsx) template for staff source deductions.
 */
export function downloadStaffContributionTemplate(options: {
  prefillMembers?: RegisteredMember[];
  period?: string;
  defaultAmount?: number;
  fileName?: string;
}) {
  const currentPeriod = options.period || format(new Date(), 'MMMM yyyy');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const defaultAmount = options.defaultAmount || 50000;

  const dataRows: Record<string, any>[] = [];

  if (options.prefillMembers && options.prefillMembers.length > 0) {
    options.prefillMembers.forEach((m) => {
      dataRows.push({
        'Staff Email': m.email || '',
        'Staff Name': m.name || '',
        'Phone Number': m.phone || '',
        'Amount (RWF)': defaultAmount,
        'Period': currentPeriod,
        'Deduction Date': todayStr,
        'Notes / Payroll Ref': `Source deduction - ${currentPeriod}`
      });
    });
  } else {
    // Blank template with 2 sample demonstration rows
    dataRows.push(
      {
        'Staff Email': 'john.doe@company.rw',
        'Staff Name': 'John Doe',
        'Phone Number': '+250788123456',
        'Amount (RWF)': 50000,
        'Period': currentPeriod,
        'Deduction Date': todayStr,
        'Notes / Payroll Ref': `Payroll deduction - ${currentPeriod}`
      },
      {
        'Staff Email': 'jane.smith@company.rw',
        'Staff Name': 'Jane Smith',
        'Phone Number': '+250788654321',
        'Amount (RWF)': 75000,
        'Period': currentPeriod,
        'Deduction Date': todayStr,
        'Notes / Payroll Ref': `Payroll deduction - ${currentPeriod}`
      }
    );
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: Staff Contributions
  const wsData = XLSX.utils.json_to_sheet(dataRows);

  // Set explicit column widths for readability in Excel
  wsData['!cols'] = [
    { wch: 30 }, // Staff Email
    { wch: 25 }, // Staff Name
    { wch: 18 }, // Phone Number
    { wch: 16 }, // Amount (RWF)
    { wch: 18 }, // Period
    { wch: 16 }, // Deduction Date
    { wch: 35 }, // Notes / Payroll Ref
  ];

  XLSX.utils.book_append_sheet(wb, wsData, 'Staff_Contributions');

  // Sheet 2: Guidelines & Instructions
  const instructions = [
    ['IKIMINA STAFF CONTRIBUTIONS (SOURCE DEDUCTIONS) - TEMPLATE GUIDE'],
    [''],
    ['1. How Staff are Matched:'],
    ['   - Staff Email is the primary key. Make sure the email matches the registered account in the system.'],
    ['   - If the email is missing or differs, the system will attempt matching by Phone Number or Full Name.'],
    [''],
    ['2. Amount Column:'],
    ['   - Must be a positive numeric value in RWF (e.g. 50000).'],
    ['   - Do not include currency symbols (RWF, $) or commas in the number cell.'],
    [''],
    ['3. Period Column:'],
    ['   - Specify the payroll month, for example: "October 2026" or "2026-10".'],
    [''],
    ['4. Deduction Date Column:'],
    ['   - Format as YYYY-MM-DD (e.g. ' + todayStr + ') or leave blank to record as current date.'],
    [''],
    ['5. Processing Workflow:'],
    ['   - Once uploaded by the Accountant or Admin, you can review any unmatched staff before confirming.'],
    ['   - All confirmed contributions will be verified and credited directly to members\' savings balance.']
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(instructions);
  wsGuide['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');

  const fileBase = options.fileName || `Staff_Contributions_Template_${currentPeriod.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, fileBase);
}

/**
 * Normalizes a header string by lowercasing and stripping non-alphanumeric chars.
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Strips phone number to numeric digits for matching.
 */
function cleanDigits(str?: string): string {
  if (!str) return '';
  return str.replace(/\D/g, '');
}

/**
 * Parses an uploaded Excel or CSV file and cross-references staff against registered members.
 */
export async function parseStaffContributionExcel(
  fileBuffer: ArrayBuffer,
  registeredMembers: RegisteredMember[]
): Promise<ParseResult> {
  const wb = XLSX.read(fileBuffer, { type: 'array' });
  
  // Pick the first sheet or the sheet named 'Staff_Contributions'
  const sheetName = wb.SheetNames.includes('Staff_Contributions')
    ? 'Staff_Contributions'
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error('The uploaded spreadsheet contains no readable sheets.');
  }

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded file is empty or does not contain data rows.');
  }

  // Pre-index registered members for fast lookup
  const membersByEmail = new Map<string, RegisteredMember>();
  const membersByPhone = new Map<string, RegisteredMember>();
  const membersByName = new Map<string, RegisteredMember>();

  registeredMembers.forEach((m) => {
    if (m.email) {
      membersByEmail.set(m.email.toLowerCase().trim(), m);
    }
    const cleanP = cleanDigits(m.phone);
    if (cleanP.length >= 8) {
      membersByPhone.set(cleanP.slice(-9), m);
    }
    if (m.name) {
      membersByName.set(m.name.toLowerCase().trim(), m);
    }
  });

  const parsedRows: ParsedContributionRow[] = [];
  let totalAmount = 0;
  let validRows = 0;
  let unmatchedRows = 0;
  let invalidAmountRows = 0;
  let detectedPeriod: string | undefined = undefined;

  rawRows.forEach((row, idx) => {
    // Map dynamic column names
    let staffEmail = '';
    let staffName = '';
    let phone = '';
    let rawAmount: any = null;
    let period = '';
    let deductionDate = '';
    let notes = '';

    for (const [key, val] of Object.entries(row)) {
      const norm = normalizeKey(key);
      const strVal = String(val ?? '').trim();

      if (norm.includes('email') || norm === 'mail') {
        staffEmail = strVal;
      } else if (norm.includes('name') || norm === 'staff' || norm === 'member') {
        staffName = strVal;
      } else if (norm.includes('phone') || norm.includes('tel') || norm.includes('mobile')) {
        phone = strVal;
      } else if (norm.includes('amount') || norm.includes('contribution') || norm.includes('rwf')) {
        rawAmount = val;
      } else if (norm.includes('period') || norm.includes('month')) {
        period = strVal;
      } else if (norm.includes('date')) {
        deductionDate = strVal;
      } else if (norm.includes('note') || norm.includes('ref') || norm.includes('justification')) {
        notes = strVal;
      }
    }

    // Skip empty filler rows
    if (!staffEmail && !staffName && !rawAmount && !phone) {
      return;
    }

    if (!detectedPeriod && period) {
      detectedPeriod = period;
    }

    // Clean amount
    let amount = 0;
    if (typeof rawAmount === 'number') {
      amount = rawAmount;
    } else if (typeof rawAmount === 'string') {
      const cleaned = rawAmount.replace(/[^0-9.-]+/g, '');
      amount = parseFloat(cleaned) || 0;
    }

    // Match member
    let matchedMember: RegisteredMember | undefined = undefined;

    if (staffEmail) {
      matchedMember = membersByEmail.get(staffEmail.toLowerCase().trim());
    }

    if (!matchedMember && phone) {
      const cleanP = cleanDigits(phone);
      if (cleanP.length >= 8) {
        matchedMember = membersByPhone.get(cleanP.slice(-9));
      }
    }

    if (!matchedMember && staffName) {
      matchedMember = membersByName.get(staffName.toLowerCase().trim());
    }

    // Determine row validity
    let status: 'valid' | 'unmatched' | 'invalid_amount' = 'valid';
    let errorMessage: string | undefined = undefined;

    if (!matchedMember) {
      status = 'unmatched';
      errorMessage = 'No registered member found with this email, phone, or name.';
      unmatchedRows++;
    } else if (amount <= 0) {
      status = 'invalid_amount';
      errorMessage = 'Contribution amount must be greater than 0.';
      invalidAmountRows++;
    } else {
      validRows++;
      totalAmount += amount;
    }

    parsedRows.push({
      rowNumber: idx + 2, // 1-indexed Excel row (row 1 is header)
      staffEmail,
      staffName: staffName || matchedMember?.name || '',
      phone: phone || matchedMember?.phone || '',
      amount,
      period,
      deductionDate,
      notes: notes || `Payroll source deduction`,
      status,
      matchedMember,
      memberId: matchedMember?.id,
      errorMessage
    });
  });

  return {
    fileName: 'uploaded_file',
    totalRows: parsedRows.length,
    validRows,
    unmatchedRows,
    invalidAmountRows,
    totalAmount,
    rows: parsedRows,
    detectedPeriod
  };
}
