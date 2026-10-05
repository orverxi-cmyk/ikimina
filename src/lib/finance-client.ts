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
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

export function formatFinanceActionError(error: unknown, fallbackMessage: string): Error {
  if (isBrowserOffline()) {
    return new Error('Your device is currently offline. Please check your internet connection and try again.');
  }
  const parsed = parseAppError(error);
  return new Error(parsed.message || fallbackMessage);
}

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
  maxLendingPoolPercentage?: number;
  minLoanAmount: number;
  maxLoanAmount?: number;
  penaltyRate: number;
  depositBankName?: string;
  depositAccountNumber?: string;
  infrastructureBranding?: string;
  appName?: string;
  aboutUs?: string;
  termsOfService?: string;
  privacyPolicy?: string;
  copyrightNotice?: string;
  payoutCampaign?: {
    status: 'open' | 'closed';
    targetAmount?: number | null;
    announcement?: string;
    openedAt?: any;
    openedBy?: string;
    closedAt?: any;
    lastDistributionId?: string;
    lastDistributionAmount?: number;
  };
};

export const DEFAULT_SETTINGS: SystemSettings = {
  currency: 'RWF',
  loanInterestRate: 10,
  interestModel: 'one-off',
  interestType: 'immediate',
  contributionInterestRate: 50000,
  maxLoanPercentage: 200,
  maxLendingPoolPercentage: 90,
  minLoanAmount: 5000,
  penaltyRate: 2,
  depositBankName: '',
  depositAccountNumber: '',
  infrastructureBranding: 'Secure Infrastructure Provided by ORVEXI',
  appName: 'Ikimina App',
  aboutUs: '',
  termsOfService: '',
  privacyPolicy: '',
  copyrightNotice: '',
  payoutCampaign: { status: 'closed' },
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
    throw formatFinanceActionError(error, 'Failed to allocate interest through Cloud Function.');
  }
}

/**
 * Initiates an Interest Distribution proposal in Cloud Functions (Accountant / Admin).
 */
export async function initiateInterestDistributionAction(data: {
  totalInterestToDistribute: number;
  justification: string;
}) {
  const functions = getFinanceFunctions();
  const initFn = httpsCallable(functions, 'initiateInterestDistribution');
  try {
    const result = await initFn(data);
    return result.data as {
      success: boolean;
      requestId: string;
      totalInterestToDistribute: number;
      recipientsCount: number;
      capitalizedCount: number;
      cashPayoutCount: number;
      totalCapitalizedToContributions: number;
      totalCashPayout: number;
    };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to initiate interest distribution.');
  }
}

/**
 * Super Administrator approves and commits an interest distribution proposal to official ledgers.
 * Strictly enforces dual-control segregation of duties.
 */
export async function approveInterestDistributionAction(data: {
  requestId: string;
  approvalNotes?: string;
}) {
  const functions = getFinanceFunctions();
  const appFn = httpsCallable(functions, 'approveInterestDistribution');
  try {
    const result = await appFn(data);
    return result.data as {
      success: boolean;
      distributionId: string;
      requestId: string;
      amountDistributed: number;
      recipientsCount: number;
    };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to approve interest distribution.');
  }
}

/**
 * Rejects an interest distribution proposal in Cloud Functions.
 */
export async function rejectInterestDistributionAction(data: {
  requestId: string;
  rejectionReason: string;
}) {
  const functions = getFinanceFunctions();
  const rejFn = httpsCallable(functions, 'rejectInterestDistribution');
  try {
    const result = await rejFn(data);
    return result.data as { success: boolean; requestId: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to reject interest distribution.');
  }
}

/**
 * Opens an active member interest payout election campaign.
 */
export async function openInterestPayoutCampaignAction(data: {
  targetAmount?: number | null;
  announcement?: string;
}) {
  const functions = getFinanceFunctions();
  const openFn = httpsCallable(functions, 'openInterestPayoutCampaign');
  try {
    const result = await openFn(data);
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to open interest payout campaign.');
  }
}

/**
 * Closes an active interest payout election campaign.
 */
export async function closeInterestPayoutCampaignAction() {
  const functions = getFinanceFunctions();
  const closeFn = httpsCallable(functions, 'closeInterestPayoutCampaign');
  try {
    const result = await closeFn();
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to close interest payout campaign.');
  }
}

/**
 * Records a member's preference for interest payout:
 * - 'add_to_contribution': Capitalize into total verified savings.
 * - 'receive_payout': Liquid cash payout (accrued interest).
 */
export async function setMemberPayoutPreferenceAction(preference: 'add_to_contribution' | 'receive_payout', memberId?: string) {
  const functions = getFinanceFunctions();
  const prefFn = httpsCallable(functions, 'setMemberPayoutPreference');
  try {
    const result = await prefFn({ preference, memberId });
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to save payout preference.');
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
    throw formatFinanceActionError(error, 'Failed to reset financial data through Cloud Function.');
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
  maxLendingPoolPercentage?: number,
  minLoanAmount: number, 
  maxLoanAmount?: number,
  penaltyRate?: number,
  depositBankName?: string,
  depositAccountNumber?: string,
  infrastructureBranding?: string,
  appName?: string,
  aboutUs?: string,
  termsOfService?: string,
  privacyPolicy?: string,
  copyrightNotice?: string,
  justification: string 
}) {
  const functions = getFinanceFunctions();
  const settingsFn = httpsCallable(functions, 'updateFinancialSettings');
  try {
    const result = await settingsFn(data);
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to update financial settings through Cloud Function.');
  }
}

/**
 * Fetches real-time institutional lending pool metrics and liquidity capacity.
 */
export async function getGroupLiquidityMetricsAction() {
  const functions = getFinanceFunctions();
  const metricsFn = httpsCallable(functions, 'getGroupLiquidityMetrics');
  try {
    const result = await metricsFn();
    return result.data as {
      totalVerifiedSavings: number;
      totalLoanInterests: number;
      totalApprovedExpenses: number;
      grossCapital: number;
      netTotalAssets: number;
      maxLendingPoolPercentage: number;
      maxLendingPool: number;
      currentActiveLoanBalance: number;
      availableLendingPool: number;
      currency: string;
    };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to fetch group liquidity metrics.');
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
    throw formatFinanceActionError(error, 'Failed to record contribution');
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
    throw formatFinanceActionError(error, 'Failed to verify contribution');
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
    throw formatFinanceActionError(error, 'Failed to reject contribution');
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
    throw formatFinanceActionError(error, 'Failed to process bulk upload.');
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
    throw formatFinanceActionError(error, 'Failed to initiate contribution batch.');
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
    throw formatFinanceActionError(error, 'Failed to submit review for batch.');
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
    throw formatFinanceActionError(error, 'Failed to execute final approval for batch.');
  }
}

/**
 * Bulk reviews multiple contribution batches.
 */
export async function bulkReviewContributionBatchesAction(data: {
  batchIds: string[];
  decision: 'endorse' | 'request_changes' | 'reject';
  reviewNotes: string;
}) {
  const functions = getFinanceFunctions();
  const bulkRevFn = httpsCallable(functions, 'bulkReviewContributionBatches');
  try {
    const result = await bulkRevFn(data);
    return result.data as { success: boolean; processedCount: number; totalRequested: number; status: string; errors?: string[] };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to bulk review contribution batches.');
  }
}

/**
 * Bulk approves multiple contribution batches.
 */
export async function bulkApproveContributionBatchesAction(data: {
  batchIds: string[];
  decision: 'approve' | 'reject';
  approvalNotes: string;
}) {
  const functions = getFinanceFunctions();
  const bulkAppFn = httpsCallable(functions, 'bulkApproveContributionBatches');
  try {
    const result = await bulkAppFn(data);
    return result.data as { success: boolean; processedBatches: number; totalRequested: number; totalItemsCommitted: number; totalAmountCommitted: number; decision: string; errors?: string[] };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to bulk approve contribution batches.');
  }
}

/**
 * Bulk verifies multiple individual pending contributions.
 */
export async function bulkVerifyContributionsAction(data: {
  contributionIds: string[];
  justification: string;
}) {
  const functions = getFinanceFunctions();
  const bulkVerifyFn = httpsCallable(functions, 'bulkVerifyContributions');
  try {
    const result = await bulkVerifyFn(data);
    return result.data as { success: boolean; count: number };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to bulk verify contributions.');
  }
}

/**
 * Bulk rejects multiple individual pending contributions.
 */
export async function bulkRejectContributionsAction(data: {
  contributionIds: string[];
  rejectionReason: string;
}) {
  const functions = getFinanceFunctions();
  const bulkRejectFn = httpsCallable(functions, 'bulkRejectContributions');
  try {
    const result = await bulkRejectFn(data);
    return result.data as { success: boolean; count: number };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to bulk reject contributions.');
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
    throw formatFinanceActionError(error, 'Failed to record repayment');
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
    throw formatFinanceActionError(error, 'Failed to verify repayment');
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
    throw formatFinanceActionError(error, 'Failed to approve loan');
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
    throw formatFinanceActionError(error, 'Failed to reject loan');
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
    throw formatFinanceActionError(error, 'Failed to update role');
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
    throw formatFinanceActionError(error, 'Failed to register member');
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
    throw formatFinanceActionError(error, 'Failed bulk registration');
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
    throw formatFinanceActionError(error, 'Failed to log action');
  }
}

/**
 * Submits a loan application (standard or top-up) via Cloud Functions with authoritative server validation.
 */
export async function requestLoanAction(data: { 
  amount: number; 
  description?: string; 
  durationMonths?: number; 
  isTopUp?: boolean; 
  parentLoanId?: string;
  exceedsBorrowingPower?: boolean;
  managementApprovalUrl?: string;
  managementApprovalFileName?: string;
  managementApprovalNotes?: string;
}) {
  const functions = getFinanceFunctions();
  const reqFn = httpsCallable(functions, 'requestLoan');
  try {
    const result = await reqFn(data);
    return result.data as { success: boolean, loanId: string, isTopUp?: boolean, exceedsBorrowingPower?: boolean };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to submit loan application');
  }
}

/**
 * Withdraws a pending loan application before management approval.
 */
export async function withdrawLoanApplicationAction(data: { loanId: string; reason?: string }) {
  const functions = getFinanceFunctions();
  const withdrawFn = httpsCallable(functions, 'withdrawLoanApplication');
  try {
    const result = await withdrawFn(data);
    return result.data as { success: boolean, loanId: string, status: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to withdraw loan application');
  }
}

/**
 * Reverses an approved/verified contribution.
 * Restricted to Administrators and Management.
 */
export async function reverseContributionAction(data: { contributionId: string; justification: string }) {
  const functions = getFinanceFunctions();
  const reverseFn = httpsCallable(functions, 'reverseContribution');
  try {
    const result = await reverseFn(data);
    return result.data as { success: boolean, contributionId: string, status: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to reverse contribution approval');
  }
}

/**
 * Bulk reverses multiple approved/verified contributions.
 * Restricted to Administrators and Management.
 */
export async function bulkReverseContributionsAction(data: { contributionIds: string[]; justification: string }) {
  const functions = getFinanceFunctions();
  const bulkRevFn = httpsCallable(functions, 'bulkReverseContributions');
  try {
    const result = await bulkRevFn(data);
    return result.data as { success: boolean, count: number, errors?: string[] };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to bulk reverse contribution approvals');
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
    throw formatFinanceActionError(error, 'Failed to submit contribution');
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
    throw formatFinanceActionError(error, 'Failed to remove member');
  }
}

/**
 * Submits an official account deletion request by a member.
 */
export async function requestAccountDeletionAction(data: {
  reason: string;
  savingsBalance?: number;
  accruedInterest?: number;
  activeLoanBalance?: number;
}) {
  const functions = getFinanceFunctions();
  const reqFn = httpsCallable(functions, 'requestAccountDeletion');
  try {
    const result = await reqFn(data);
    return result.data as { success: boolean; requestId: string };
  } catch (error: any) {
    if (error?.code === 'functions/not-found' || error?.message?.includes('not found')) {
      const { firestore, auth } = initializeFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentication required.');

      const reqCol = collection(firestore, 'account_deletion_requests');
      const docRef = await addDoc(reqCol, {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Member',
        userEmail: (currentUser.email || '').toLowerCase(),
        savingsBalance: data.savingsBalance || 0,
        accruedInterest: data.accruedInterest || 0,
        activeLoanBalance: data.activeLoanBalance || 0,
        reason: data.reason.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        requestedAt: serverTimestamp(),
      });

      try {
        await updateDoc(doc(firestore, 'users', currentUser.uid), {
          deletionRequested: true,
          deletionRequestId: docRef.id,
        });
      } catch (e) {}

      return { success: true, requestId: docRef.id };
    }
    throw formatFinanceActionError(error, 'Failed to submit account deletion request.');
  }
}

/**
 * Cancels or withdraws a pending account deletion request.
 */
export async function cancelAccountDeletionRequestAction(requestId: string) {
  const functions = getFinanceFunctions();
  const cancelFn = httpsCallable(functions, 'cancelAccountDeletionRequest');
  try {
    const result = await cancelFn({ requestId });
    return result.data as { success: boolean; requestId: string };
  } catch (error: any) {
    if (error?.code === 'functions/not-found' || error?.message?.includes('not found')) {
      const { firestore, auth } = initializeFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentication required.');

      await updateDoc(doc(firestore, 'account_deletion_requests', requestId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: currentUser.uid,
      });

      try {
        await updateDoc(doc(firestore, 'users', currentUser.uid), {
          deletionRequested: false,
          deletionRequestId: deleteField(),
        });
      } catch (e) {}

      return { success: true, requestId };
    }
    throw formatFinanceActionError(error, 'Failed to cancel account deletion request.');
  }
}

/**
 * Super Administrator approves a pending account deletion request.
 */
export async function approveAccountDeletionAction(data: {
  requestId: string;
  adminNotes?: string;
  targetUserId?: string;
}) {
  const functions = getFinanceFunctions();
  const appFn = httpsCallable(functions, 'approveAccountDeletion');
  try {
    const result = await appFn(data);
    return result.data as { success: boolean; requestId: string; targetUserId?: string };
  } catch (error: any) {
    if (error?.code === 'functions/not-found' || error?.message?.includes('not found')) {
      const { firestore, auth } = initializeFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentication required.');

      await updateDoc(doc(firestore, 'account_deletion_requests', data.requestId), {
        status: 'approved',
        reviewedBy: currentUser.uid,
        reviewedByName: currentUser.displayName || 'Super Admin',
        reviewedAt: serverTimestamp(),
        adminNotes: data.adminNotes?.trim() || '',
      });

      if (data.targetUserId) {
        try {
          await deleteDoc(doc(firestore, 'users', data.targetUserId));
        } catch (e) {}
      }

      return { success: true, requestId: data.requestId, targetUserId: data.targetUserId };
    }
    throw formatFinanceActionError(error, 'Failed to approve account deletion request.');
  }
}

/**
 * Super Administrator rejects a pending account deletion request.
 */
export async function rejectAccountDeletionAction(data: {
  requestId: string;
  rejectionReason: string;
  targetUserId?: string;
}) {
  const functions = getFinanceFunctions();
  const rejFn = httpsCallable(functions, 'rejectAccountDeletion');
  try {
    const result = await rejFn(data);
    return result.data as { success: boolean; requestId: string; targetUserId?: string };
  } catch (error: any) {
    if (error?.code === 'functions/not-found' || error?.message?.includes('not found')) {
      const { firestore, auth } = initializeFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentication required.');

      await updateDoc(doc(firestore, 'account_deletion_requests', data.requestId), {
        status: 'rejected',
        reviewedBy: currentUser.uid,
        reviewedByName: currentUser.displayName || 'Super Admin',
        reviewedAt: serverTimestamp(),
        rejectionReason: data.rejectionReason.trim(),
      });

      if (data.targetUserId) {
        try {
          await updateDoc(doc(firestore, 'users', data.targetUserId), {
            deletionRequested: false,
            deletionRequestId: deleteField(),
          });
        } catch (e) {}
      }

      return { success: true, requestId: data.requestId, targetUserId: data.targetUserId };
    }
    throw formatFinanceActionError(error, 'Failed to reject account deletion request.');
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
    throw formatFinanceActionError(error, 'Failed to update member profile');
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
    throw formatFinanceActionError(error, 'Failed to activate member account');
  }
}

/**
 * Lodges a new operational expense in Cloud Functions.
 * Requires a supporting document (receipt / invoice / voucher).
 */
export async function lodgeExpenseAction(data: {
  title: string;
  category: string;
  amount: number;
  description?: string;
  expenseDate?: string;
  receiptUrl: string;
  receiptFileName?: string;
}) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'lodgeExpense');
  try {
    const result = await fn(data);
    return result.data as { success: boolean; expenseId: string; message: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to lodge expense');
  }
}

/**
 * Approves an operational expense in Cloud Functions.
 * Approved expenses are authoritatively deducted from total institutional assets.
 */
export async function approveExpenseAction(data: {
  expenseId: string;
  adminNotes?: string;
}) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'approveExpense');
  try {
    const result = await fn(data);
    return result.data as { success: boolean; expenseId: string; message: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to approve expense');
  }
}

/**
 * Rejects an operational expense in Cloud Functions.
 */
export async function rejectExpenseAction(data: {
  expenseId: string;
  rejectionReason: string;
  adminNotes?: string;
}) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'rejectExpense');
  try {
    const result = await fn(data);
    return result.data as { success: boolean; expenseId: string; message: string };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to reject expense');
  }
}


