'use server';

/**
 * @fileOverview Secure server actions for financial operations.
 * Handles sensitive loan approvals, contribution recording, and member management.
 */

import { initializeFirebase } from '@/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  writeBatch, 
  Timestamp,
  increment 
} from 'firebase/firestore';
import { generateAmortizationSchedule } from '@/lib/loan-utils';

/**
 * Records a member contribution securely on the server.
 */
export async function recordContributionAction(data: {
  memberId: string;
  amount: number;
  period: string;
  adminId: string;
}) {
  const { firestore } = initializeFirebase();
  
  await addDoc(collection(firestore, 'contributions'), {
    memberId: data.memberId,
    amount: data.amount,
    period: data.period,
    date: serverTimestamp(),
    recordedBy: data.adminId,
  });

  return { success: true };
}

/**
 * Approves a loan and generates the amortization schedule.
 * This complex operation is handled on the server to ensure financial integrity.
 */
export async function approveLoanAction(loanId: string, params: {
  memberId: string;
  amount: number;
  interestAmount: number;
  interestType: 'immediate' | 'afterward';
  penaltyRate: number;
  durationMonths: number;
  startDate: string;
  checkUrl: string;
}) {
  const { firestore } = initializeFirebase();
  const batch = writeBatch(firestore);
  
  const startDate = new Date(params.startDate);
  const dueDate = new Date(startDate);
  dueDate.setMonth(dueDate.getMonth() + params.durationMonths);

  const interestTotal = params.interestType === 'afterward' ? params.interestAmount : 0;
  const totalBalance = params.amount + interestTotal;

  const schedule = generateAmortizationSchedule(params.amount, interestTotal, params.durationMonths, startDate);

  // 1. Update Loan Document
  batch.update(doc(firestore, 'loans', loanId), {
    status: 'approved',
    startDate: Timestamp.fromDate(startDate),
    dueDate: Timestamp.fromDate(dueDate),
    checkUrl: params.checkUrl,
    interestAmount: params.interestAmount,
    interestType: params.interestType,
    penaltyRate: params.penaltyRate,
    balance: totalBalance,
    durationMonths: params.durationMonths,
    amortization: schedule,
    approvedAt: serverTimestamp(),
  });

  // 2. Sync Schedule to Member Document
  batch.update(doc(firestore, 'users', params.memberId), {
    amortizationSchedule: schedule.map(s => ({
      ...s,
      dueDate: Timestamp.fromDate(s.dueDate)
    }))
  });

  await batch.commit();
  return { success: true };
}

/**
 * Bulk registers members from a CSV import.
 */
export async function bulkRegisterMembersAction(members: Array<{
  name: string;
  email: string;
  phone: string;
  role: string;
}>) {
  const { firestore } = initializeFirebase();
  const batch = writeBatch(firestore);
  let count = 0;

  for (const m of members) {
    const newDocRef = doc(collection(firestore, 'users'));
    batch.set(newDocRef, {
      name: m.name,
      email: m.email.toLowerCase(),
      phone: m.phone || '',
      role: m.role || 'member',
      joinedAt: serverTimestamp(),
      status: 'pending',
    });
    count++;
  }

  await batch.commit();
  return { success: true, count };
}

/**
 * Processes a loan repayment installment.
 */
export async function processRepaymentAction(params: {
  loanId: string;
  memberId: string;
  amount: number;
  installmentNumber: number;
  proofUrl: string;
  currentAmortization: any[];
}) {
  const { firestore } = initializeFirebase();
  const batch = writeBatch(firestore);

  const updatedAmortization = params.currentAmortization.map((inst: any) => {
    if (inst.installmentNumber === params.installmentNumber) {
      return { 
        ...inst, 
        status: 'paid', 
        proofUrl: params.proofUrl, 
        paidAt: new Date() 
      };
    }
    return inst;
  });

  // 1. Update Loan Status and Balance
  batch.update(doc(firestore, 'loans', params.loanId), {
    balance: increment(-params.amount),
    amortization: updatedAmortization,
  });

  // 2. Sync to Member Profile
  batch.update(doc(firestore, 'users', params.memberId), {
    amortizationSchedule: updatedAmortization.map((s: any) => ({
      ...s,
      dueDate: s.dueDate instanceof Timestamp ? s.dueDate : Timestamp.fromDate(new Date(s.dueDate)),
      paidAt: s.paidAt ? Timestamp.fromDate(new Date(s.paidAt)) : (s.paidAt ? Timestamp.fromDate(new Date(s.paidAt)) : null)
    }))
  });

  // 3. Record Repayment Document
  const repaymentRef = doc(collection(firestore, 'repayments'));
  batch.set(repaymentRef, {
    loanId: params.loanId,
    memberId: params.memberId,
    amount: params.amount,
    installmentNumber: params.installmentNumber,
    proofUrl: params.proofUrl,
    date: serverTimestamp(),
    status: 'pending'
  });

  await batch.commit();
  return { success: true };
}
