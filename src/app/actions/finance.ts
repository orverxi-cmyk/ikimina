'use server';

/**
 * @fileOverview Secure server-side actions for financial and administrative operations.
 * These functions run on the Node.js 22 server and are never exposed to the client.
 */

import { initializeFirebase } from '@/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch,
  increment,
  Timestamp
} from 'firebase/firestore';

/**
 * Registers a new member with a pending status.
 */
export async function registerMemberAction(memberData: {
  firstName: string;
  surname: string;
  email: string;
  phone: string;
  role: string;
}) {
  const { firestore } = initializeFirebase();
  const name = `${memberData.firstName} ${memberData.surname}`.trim();
  
  const newMember = {
    name,
    email: memberData.email.toLowerCase(),
    phone: memberData.phone || '',
    role: memberData.role,
    joinedAt: serverTimestamp(),
    status: 'pending',
  };

  try {
    const docRef = await addDoc(collection(firestore, 'users'), newMember);
    return { success: true, id: docRef.id };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to register member');
  }
}

/**
 * Processes a bulk upload of members.
 */
export async function bulkRegisterMembersAction(members: any[]) {
  const { firestore } = initializeFirebase();
  const batch = writeBatch(firestore);

  try {
    members.forEach(m => {
      const newDocRef = doc(collection(firestore, 'users'));
      batch.set(newDocRef, {
        name: m.name,
        email: m.email.toLowerCase(),
        phone: m.phone || '',
        role: m.role || 'member',
        joinedAt: serverTimestamp(),
        status: 'pending',
      });
    });

    await batch.commit();
    return { success: true, count: members.length };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to process bulk upload');
  }
}

/**
 * Approves a loan and generates the amortization schedule.
 */
export async function approveLoanAction(loanId: string, terms: {
  amount: number;
  memberId: string;
  interestAmount: number;
  interestType: 'immediate' | 'afterward';
  penaltyRate: number;
  durationMonths: number;
  startDate: string;
  checkUrl: string;
  schedule: any[];
}) {
  const { firestore } = initializeFirebase();
  const batch = writeBatch(firestore);

  const startDate = new Date(terms.startDate);
  const dueDate = new Date(startDate);
  dueDate.setMonth(dueDate.getMonth() + terms.durationMonths);

  const interestTotal = terms.interestType === 'afterward' ? terms.interestAmount : 0;
  const totalBalance = terms.amount + interestTotal;

  try {
    // 1. Update Loan Document
    batch.update(doc(firestore, 'loans', loanId), {
      status: 'approved',
      startDate: Timestamp.fromDate(startDate),
      dueDate: Timestamp.fromDate(dueDate),
      checkUrl: terms.checkUrl,
      interestAmount: terms.interestAmount,
      interestType: terms.interestType,
      penaltyRate: terms.penaltyRate,
      balance: totalBalance,
      durationMonths: terms.durationMonths,
      amortization: terms.schedule,
      approvedAt: serverTimestamp(),
    });

    // 2. Update User Document for easy access to schedule
    batch.update(doc(firestore, 'users', terms.memberId), {
      amortizationSchedule: terms.schedule.map(s => ({
        ...s,
        dueDate: Timestamp.fromDate(new Date(s.dueDate))
      }))
    });

    await batch.commit();
    return { success: true };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to approve loan');
  }
}
