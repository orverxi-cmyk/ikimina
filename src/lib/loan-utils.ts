
import { addMonths, format } from 'date-fns';

export interface AmortizationEntry {
  installmentNumber: number;
  dueDate: Date | any;
  amount: number;
  paidAmount?: number;
  remainingAmount?: number;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  proofUrl?: string;
  paidAt?: Date | any;
  lastPaymentAt?: Date | any;
}

/**
 * Calculates an amortization schedule for a member loan.
 * Under standard policy, one-off interest is deducted upfront from the disbursed amount,
 * and the monthly installments repay the total approved loan principal.
 * @param principal The approved loan amount.
 * @param interestTotal Any additional interest to be collected during repayments (0 when deducted at source).
 * @param months The duration of the loan in months.
 * @param startDate The date the first payment starts being calculated from.
 */
export function generateAmortizationSchedule(
  principal: number,
  interestTotal: number = 0,
  months: number,
  startDate: Date
): AmortizationEntry[] {
  const totalToPay = principal + interestTotal;
  const monthlyInstallment = Math.round(totalToPay / months);
  
  const schedule: AmortizationEntry[] = [];
  
  for (let i = 1; i <= months; i++) {
    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(startDate, i),
      amount: monthlyInstallment,
      paidAmount: 0,
      remainingAmount: monthlyInstallment,
      status: 'pending'
    });
  }
  
  return schedule;
}

/**
 * Safely parses any date representation (Date, Firestore Timestamp, serialized Timestamp {seconds, nanoseconds}, ISO string, number) into a valid JS Date.
 */
export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      // fallback
    }
  }
  if (typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val._seconds === 'number') {
    const d = new Date(val._seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats any date safely without throwing RangeError: Invalid time value.
 */
export function safeFormatDate(val: any, formatStr: string = 'MMM d, yyyy', fallback: string = '-'): string {
  const d = parseSafeDate(val);
  if (!d) return fallback;
  try {
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}
