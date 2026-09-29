'use client';
/**
 * @fileOverview Client-side bridge to secure Firebase Callable Cloud Functions.
 * 
 * ARCHITECTURE PRINCIPLE:
 * All financial state mutations, balance updates, interest allocations, and ledger resets
 * are executed exclusively within authoritative Cloud Functions using the Firebase Admin SDK.
 * The client environment is strictly untrusted and only handles user interaction, form inputs,
 * and ephemeral UI feedback.
 */

import { initializeFirebase } from '@/firebase';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

const getFinanceFunctions = () => {
  if (!functionsInstance) {
    const { app } = initializeFirebase();
    // Default region for Firebase Functions v2
    functionsInstance = getFunctions(app, 'us-central1');

    // Support local Firebase Functions emulator if configured
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST) {
      const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
      const host = emulatorHost.includes(':') ? emulatorHost.split(':')[0] : '127.0.0.1';
      const port = emulatorHost.includes(':') ? Number(emulatorHost.split(':')[1]) : 5001;
      connectFunctionsEmulator(functionsInstance, host, port);
    }
  }
  return functionsInstance;
};

/**
 * Executes authoritative profit distribution in Cloud Functions.
 * Calculates realized loan revenue, unallocated pool, and member weights server-side.
 */
export async function allocateInterestAction(uid: string, data: { 
  totalInterestToDistribute: number, 
  justification: string 
}) {
  const functions = getFinanceFunctions();
  const allocateFn = httpsCallable(functions, 'allocateInterest');
  try {
    const result = await allocateFn({
      totalInterestToDistribute: data.totalInterestToDistribute,
      justification: data.justification
    });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to allocate interest through Cloud Function.');
  }
}

/**
 * Executes full financial ledger reset in Cloud Functions.
 * Restricted strictly to Super Administrators.
 */
export async function resetFinancialDataAction(data: { justification: string, confirmationText?: string, adminEmail?: string }) {
  const functions = getFinanceFunctions();
  const resetFn = httpsCallable(functions, 'resetFinancialData');
  try {
    const result = await resetFn({
      justification: data.justification
    });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to reset financial data through Cloud Function.');
  }
}

/**
 * Updates global financial policies in Cloud Functions.
 */
export async function updateFinancialSettingsAction(data: { 
  currency?: string,
  loanInterestRate: number, 
  interestModel?: string,
  interestType?: string,
  contributionInterestRate: number, 
  maxLoanPercentage: number, 
  minLoanAmount: number, 
  maxLoanAmount: number,
  penaltyRate?: number,
  justification: string 
}) {
  const functions = getFinanceFunctions();
  const settingsFn = httpsCallable(functions, 'updateFinancialSettings');
  try {
    const result = await settingsFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update financial settings through Cloud Function.');
  }
}

/**
 * Securely records a member contribution in Cloud Functions.
 */
export async function recordContributionAction(uid: string, data: { memberId: string, amount: number, period: string, justification: string }) {
  const functions = getFinanceFunctions();
  const recordFn = httpsCallable(functions, 'recordContribution');
  try {
    const result = await recordFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to record contribution');
  }
}

/**
 * Verifies a contribution in Cloud Functions.
 */
export async function verifyContributionAction(uid: string, data: { contributionId: string, justification: string }) {
  const functions = getFinanceFunctions();
  const verifyFn = httpsCallable(functions, 'verifyContribution');
  try {
    const result = await verifyFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to verify contribution');
  }
}

/**
 * Rejects a contribution in Cloud Functions.
 */
export async function rejectContributionAction(uid: string, data: { contributionId: string, rejectionReason: string }) {
  const functions = getFinanceFunctions();
  const rejectFn = httpsCallable(functions, 'rejectContribution');
  try {
    const result = await rejectFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to reject contribution');
  }
}

/**
 * Records a loan repayment in Cloud Functions.
 */
export async function recordRepaymentAction(data: { loanId: string, amount: number, proofUrl: string, justification?: string }) {
  const functions = getFinanceFunctions();
  const repayFn = httpsCallable(functions, 'recordRepayment');
  try {
    const result = await repayFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to record repayment');
  }
}

/**
 * Verifies a loan repayment in Cloud Functions.
 */
export async function verifyRepaymentAction(data: { repaymentId: string, justification: string }) {
  const functions = getFinanceFunctions();
  const verifyFn = httpsCallable(functions, 'verifyRepayment');
  try {
    const result = await verifyFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to verify repayment');
  }
}

/**
 * Approves a loan and sets repayment schedule in Cloud Functions.
 */
export async function approveLoanAction(data: { loanId: string, terms: any, justification: string }) {
  const functions = getFinanceFunctions();
  const approveFn = httpsCallable(functions, 'approveLoan');
  try {
    const result = await approveFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to approve loan');
  }
}

/**
 * Rejects a loan in Cloud Functions.
 */
export async function rejectLoanAction(data: { loanId: string, justification: string }) {
  const functions = getFinanceFunctions();
  const rejectFn = httpsCallable(functions, 'rejectLoan');
  try {
    const result = await rejectFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to reject loan');
  }
}

/**
 * Updates a user role in Cloud Functions.
 */
export async function updateUserRoleAction(targetUserId: string, role: string, justification: string) {
  const functions = getFinanceFunctions();
  const roleFn = httpsCallable(functions, 'updateUserRole');
  try {
    const result = await roleFn({ targetUserId, role, justification });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update role');
  }
}

/**
 * Registers a new member in Cloud Functions.
 */
export async function registerMemberAction(uid: string, memberData: any) {
  const functions = getFinanceFunctions();
  const registerFn = httpsCallable(functions, 'registerMember');
  try {
    const result = await registerFn({ memberData, justification: memberData.justification });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to register member');
  }
}

/**
 * Bulk registers members in Cloud Functions.
 */
export async function bulkRegisterMembersAction(uid: string, members: any[], justification: string) {
  const functions = getFinanceFunctions();
  const bulkFn = httpsCallable(functions, 'bulkRegisterMembers');
  try {
    const result = await bulkFn({ members, justification });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed bulk registration');
  }
}

/**
 * Logs an administrative audit action in Cloud Functions.
 */
export async function logAdminAction(data: { adminId: string, action: string, justification: string, details?: any }) {
  const functions = getFinanceFunctions();
  const logFn = httpsCallable(functions, 'logAdminAction');
  try {
    const result = await logFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to log action');
  }
}
