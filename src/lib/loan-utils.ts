
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
 * Calculates a simple amortization schedule based on fixed interest.
 * @param principal The amount loaned.
 * @param interestTotal The total interest amount to be paid.
 * @param months The duration of the loan.
 * @param startDate The date the first payment starts being calculated from.
 */
export function generateAmortizationSchedule(
  principal: number,
  interestTotal: number,
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
