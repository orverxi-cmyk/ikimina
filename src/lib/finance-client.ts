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
 * Canonical type for all system-wide financial policy settings.
 * All pages must consume this type via `useSettings()` — never read Firestore directly.
 */
export type SystemSettings = {
  currency: string;
  loanInterestRate: number;
  interestModel: string;
  interestType: string;
  contributionInterestRate: number;
  maxLoanPercentage: number;
  minLoanAmount: number;
  maxLoanAmount: number;
  penaltyRate: number;
};

export const DEFAULT_SETTINGS: SystemSettings = {
  currency: 'RWF',
  loanInterestRate: 10,
  interestModel: 'one-off',
  interestType: 'afterward',
  contributionInterestRate: 50000,
  maxLoanPercentage: 200,
  minLoanAmount: 5000,
  maxLoanAmount: 1000000,
  penaltyRate: 2,
};

/**
 * Fetches all financial policy settings from the authoritative Cloud Function.
 * This is the ONLY permitted way to read settings on the client.
 */
export async function getSystemSettingsAction(): Promise<SystemSettings> {
  const functions = getFinanceFunctions();
  const fn = httpsCallable<void, SystemSettings>(functions, 'getSystemSettings');
  try {
    const result = await fn();
    return result.data;
  } catch (error: any) {
    console.warn('Failed to fetch system settings from Cloud Function, using defaults.', error.message);
    return DEFAULT_SETTINGS;
  }
}

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
 * Bulk uploads staff source-deducted contributions from Excel data in Cloud Functions.
 */
export async function bulkUploadContributionsAction(data: {
  items: Array<{
    memberId: string;
    amount: number;
    period?: string;
    deductionDate?: string;
    notes?: string;
    staffName?: string;
    staffEmail?: string;
  }>;
  defaultPeriod?: string;
  justification?: string;
}) {
  const functions = getFinanceFunctions();
  const bulkFn = httpsCallable(functions, 'bulkUploadContributions');
  try {
    const result = await bulkFn(data);
    return result.data as { success: boolean; batchId: string; count: number; totalAmount: number };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to process bulk upload.');
  }
}

/**
 * Step 1: Accountant initiates a contribution upload batch.
 */
export async function initiateContributionBatchAction(data: {
  items: Array<{
    memberId: string;
    amount: number;
    period?: string;
    deductionDate?: string;
    notes?: string;
    staffName?: string;
    staffEmail?: string;
  }>;
  title?: string;
  defaultPeriod?: string;
  type?: 'historical_migration' | 'payroll_deduction';
  justification?: string;
}) {
  const functions = getFinanceFunctions();
  const initFn = httpsCallable(functions, 'initiateContributionBatch');
  try {
    const result = await initFn(data);
    return result.data as { success: boolean; batchId: string; totalCount: number; totalAmount: number; status: string };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to initiate contribution batch.');
  }
}

/**
 * Step 2: Reviewer reviews and endorses/requests revisions for the batch.
 */
export async function reviewContributionBatchAction(data: {
  batchId: string;
  decision: 'endorse' | 'request_changes' | 'reject';
  reviewNotes: string;
}) {
  const functions = getFinanceFunctions();
  const revFn = httpsCallable(functions, 'reviewContributionBatch');
  try {
    const result = await revFn(data);
    return result.data as { success: boolean; batchId: string; status: string };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to submit review for batch.');
  }
}

/**
 * Step 3: Super Administrator gives final approval to commit batch into official ledger.
 */
export async function approveContributionBatchAction(data: {
  batchId: string;
  decision: 'approve' | 'reject';
  approvalNotes: string;
}) {
  const functions = getFinanceFunctions();
  const appFn = httpsCallable(functions, 'approveContributionBatch');
  try {
    const result = await appFn(data);
    return result.data as { success: boolean; batchId: string; count?: number; totalAmount?: number; status: string };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to execute final approval for batch.');
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

/**
 * Submits a loan application via Cloud Functions with authoritative server validation.
 */
export async function requestLoanAction(data: { amount: number, description?: string, durationMonths?: number }) {
  const functions = getFinanceFunctions();
  const reqFn = httpsCallable(functions, 'requestLoan');
  try {
    const result = await reqFn(data);
    return result.data as { success: boolean, loanId: string };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to submit loan application');
  }
}

/**
 * Submits a member savings contribution via Cloud Functions for management review.
 */
export async function submitContributionAction(data: { amount: number, period: string, proofUrl: string }) {
  const functions = getFinanceFunctions();
  const submitFn = httpsCallable(functions, 'submitContribution');
  try {
    const result = await submitFn(data);
    return result.data as { success: boolean, id: string };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to submit contribution');
  }
}

/**
 * Deletes or revokes member access via Cloud Functions with loan debt verification.
 */
export async function deleteMemberAction(targetUserId: string, justification: string) {
  const functions = getFinanceFunctions();
  const delFn = httpsCallable(functions, 'deleteMember');
  try {
    const result = await delFn({ targetUserId, justification });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to remove member');
  }
}

/**
 * Updates member contact profile via Cloud Functions.
 * Accepts optional photoURL, which must be a Firebase Storage URL for the caller's own avatars path.
 */
export async function updateMemberProfileAction(targetUserId: string, data: { name?: string, phone?: string, photoURL?: string }) {
  const functions = getFinanceFunctions();
  const updateFn = httpsCallable(functions, 'updateMemberProfile');
  try {
    const result = await updateFn({ targetUserId, ...data });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update member profile');
  }
}

/**
 * Activates an invited member's account via Cloud Functions.
 */
export async function activateMemberAccountAction(memberDocId: string) {
  const functions = getFinanceFunctions();
  const actFn = httpsCallable(functions, 'activateMemberAccount');
  try {
    const result = await actFn({ memberDocId });
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to activate member account');
  }
}

