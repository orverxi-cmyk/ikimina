
import * as admin from 'firebase-admin';
import { addMonths } from 'date-fns';

/**
 * Pure logic for generating amortization schedules.
 * @param principal The requested amount.
 * @param interestTotal The total interest to be collected (0 if deducted at source).
 * @param months The loan duration.
 * @param startDate Calculation anchor.
 */
export function calculateAmortizationSchedule(
  principal: number,
  interestTotal: number,
  months: number,
  startDate: Date
) {
  // Total to pay is principal + interestTotal.
  // If interest is deducted immediately, interestTotal passed here should be 0.
  const totalToPay = principal + interestTotal;
  const monthlyInstallment = Math.round(totalToPay / months);
  
  const schedule = [];
  
  for (let i = 1; i <= months; i++) {
    schedule.push({
      installmentNumber: i,
      dueDate: admin.firestore.Timestamp.fromDate(addMonths(startDate, i)),
      amount: monthlyInstallment,
      status: 'pending'
    });
  }
  
  return schedule;
}
