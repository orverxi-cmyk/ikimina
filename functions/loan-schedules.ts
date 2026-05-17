import { addMonths } from 'date-fns';

/**
 * Pure logic for generating amortization schedules.
 * Separated to ensure consistency across the application.
 */
export function calculateAmortizationSchedule(
  principal: number,
  interestTotal: number,
  months: number,
  startDate: Date
) {
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

// Re-exporting admin for use in main file if needed
import * as admin from 'firebase-admin';