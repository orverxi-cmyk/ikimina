
import { addMonths, format } from 'date-fns';

export interface AmortizationEntry {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  proofUrl?: string;
  paidAt?: Date;
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
      status: 'pending'
    });
  }
  
  return schedule;
}
