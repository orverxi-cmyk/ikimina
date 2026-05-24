
'use client';
/**
 * @fileOverview Client-side bridge to call secure Cloud Functions.
 */

import { initializeFirebase } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const getFinanceFunctions = () => {
  const { app } = initializeFirebase();
  return getFunctions(app);
};

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

export async function allocateInterestAction(uid: string, data: { totalInterestToDistribute: number, justification: string }) {
  const functions = getFinanceFunctions();
  const allocateFn = httpsCallable(functions, 'allocateInterest');
  try {
    const result = await allocateFn(data);
    return result.data;
  } catch (error: any) {
    throw new Error(error.message || 'Failed interest allocation');
  }
}

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
    throw new Error(error.message || 'Failed to update financial settings');
  }
}

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
