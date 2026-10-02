"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectLoan = exports.verifyRepayment = exports.recordRepayment = exports.approveLoan = exports.withdrawLoanApplication = exports.requestLoan = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const loan_schedules_1 = require("./loan-schedules");
/**
 * Submits a member loan application.
 * Server authoritatively validates:
 * 1. Member authentication
 * 2. Positive amount
 * 3. Settings constraints: minLoanAmount and maxLoanAmount
 * 4. Member verified savings & maxLoanPercentage borrowing limit
 * 5. No existing active or pending loans
 */
exports.requestLoan = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const memberId = request.auth.uid;
    const { amount, description, durationMonths = 12, isTopUp = false, parentLoanId, managementApprovalUrl, managementApprovalFileName, managementApprovalNotes } = request.data || {};
    const loanAmount = Number(amount);
    if (!loanAmount || loanAmount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'A valid loan amount greater than 0 is required.');
    }
    // 1. Fetch system settings
    const settingsSnap = await db.collection('settings').doc('financials').get();
    const settings = settingsSnap.data() || {};
    const minLoanAmount = Number(settings.minLoanAmount) || 5000;
    const maxLoanAmount = Number(settings.maxLoanAmount) || 1000000;
    const maxLoanPercentage = Number(settings.maxLoanPercentage) || 200;
    if (loanAmount < minLoanAmount) {
        throw new https_1.HttpsError('failed-precondition', `Loan amount must be at least ${minLoanAmount}.`);
    }
    if (loanAmount > maxLoanAmount) {
        throw new https_1.HttpsError('failed-precondition', `Loan amount cannot exceed the maximum of ${maxLoanAmount}.`);
    }
    let availableRepaidPrincipal = 0;
    // 2. Validate top-up constraints if applying for a top-up
    if (isTopUp) {
        if (!parentLoanId) {
            throw new https_1.HttpsError('invalid-argument', 'Parent active loan ID is required for a loan top-up.');
        }
        const parentLoanRef = db.collection('loans').doc(parentLoanId);
        const parentLoanSnap = await parentLoanRef.get();
        if (!parentLoanSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Parent loan record not found.');
        }
        const parentLoanData = parentLoanSnap.data();
        if (parentLoanData.memberId !== memberId) {
            throw new https_1.HttpsError('permission-denied', 'You can only top up your own active loan.');
        }
        if (parentLoanData.status !== 'approved' || (Number(parentLoanData.balance) || 0) <= 0) {
            throw new https_1.HttpsError('failed-precondition', 'Parent loan must be an active approved loan with an outstanding balance.');
        }
        // Compute verified repayments towards parent loan
        const repaysSnap = await db.collection('repayments')
            .where('loanId', '==', parentLoanId)
            .where('status', '==', 'verified')
            .get();
        let totalVerifiedRepayments = 0;
        repaysSnap.forEach(d => {
            totalVerifiedRepayments += Number(d.data().amount) || 0;
        });
        // The maximum allowed top-up is bounded by the principal repaid on this loan so far
        const originalPrincipal = Number(parentLoanData.amount) || 0;
        availableRepaidPrincipal = Math.min(originalPrincipal, totalVerifiedRepayments);
        if (availableRepaidPrincipal <= 0) {
            throw new https_1.HttpsError('failed-precondition', 'You have not repaid any principal on your active loan yet. Make verified repayments to unlock top-up capacity.');
        }
        if (loanAmount > availableRepaidPrincipal) {
            throw new https_1.HttpsError('failed-precondition', `Requested top-up amount (${loanAmount}) exceeds your available repaid principal of ${availableRepaidPrincipal}.`);
        }
    }
    // 3. Check for active or pending loans
    const existingLoansSnap = await db.collection('loans')
        .where('memberId', '==', memberId)
        .get();
    for (const doc of existingLoansSnap.docs) {
        const l = doc.data();
        if (l.status === 'requested') {
            throw new https_1.HttpsError('already-exists', 'You already have a pending loan request under review. You can withdraw it if you want to change your request.');
        }
        if (!isTopUp && l.status === 'approved' && (Number(l.balance) || 0) > 0) {
            throw new https_1.HttpsError('failed-precondition', 'You must fully repay your active loan before requesting a new one, or apply for a loan top-up on repaid principal.');
        }
    }
    // 4. Compute member's borrowing power based on verified savings and equity
    const contribsSnap = await db.collection('contributions')
        .where('memberId', '==', memberId)
        .where('status', '==', 'verified')
        .get();
    let totalVerifiedSavings = 0;
    contribsSnap.forEach(d => {
        totalVerifiedSavings += Number(d.data().amount) || 0;
    });
    const userSnap = await db.collection('users').doc(memberId).get();
    const accruedInterest = Number((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.accruedInterest) || 0;
    const totalEquity = totalVerifiedSavings + accruedInterest;
    // Borrowing limit based on policy % of verified savings (e.g. 200%)
    const percentageLimit = Math.round((totalVerifiedSavings * maxLoanPercentage) / 100);
    const equityLimit = Math.round((totalEquity * maxLoanPercentage) / 100);
    const completedLoansCount = existingLoansSnap.docs.filter(d => d.data().status === 'completed').length;
    const trustBonusLimit = (accruedInterest + (completedLoansCount * 10000)) * 2;
    const effectiveLimit = Math.min(Math.max(percentageLimit, equityLimit, trustBonusLimit), maxLoanAmount);
    const exceedsBorrowingPower = loanAmount > effectiveLimit;
    if (exceedsBorrowingPower) {
        if (!managementApprovalUrl || typeof managementApprovalUrl !== 'string' || !managementApprovalUrl.trim()) {
            throw new https_1.HttpsError('failed-precondition', `Requested loan amount of ${loanAmount.toLocaleString()} exceeds your standard borrowing power of ${effectiveLimit.toLocaleString()}. You must attach a valid management approval document to proceed.`);
        }
    }
    else {
        if (totalVerifiedSavings <= 0 && totalEquity <= 0 && completedLoansCount === 0) {
            throw new https_1.HttpsError('failed-precondition', 'You must have verified savings contributions before requesting a loan, or attach management approval.');
        }
        if (effectiveLimit < minLoanAmount) {
            throw new https_1.HttpsError('failed-precondition', `Your current borrowing limit of ${effectiveLimit.toLocaleString()} is below the minimum allowed loan amount of ${minLoanAmount.toLocaleString()}. Attach management approval to apply for this amount.`);
        }
    }
    // 5. Create loan application
    const loanRef = db.collection('loans').doc();
    await loanRef.set({
        memberId,
        amount: loanAmount,
        description: description || (isTopUp ? `Loan Top-Up against facility #${parentLoanId.slice(0, 7)}` : 'Member capital loan application'),
        status: 'requested',
        requestDate: admin.firestore.FieldValue.serverTimestamp(),
        balance: 0,
        interestAmount: 0,
        penaltyRate: 0,
        durationMonths: Number(durationMonths) || 12,
        isTopUp: Boolean(isTopUp),
        parentLoanId: isTopUp ? parentLoanId : null,
        repaidPrincipalAtRequest: isTopUp ? availableRepaidPrincipal : null,
        exceedsBorrowingPower: Boolean(exceedsBorrowingPower),
        borrowingPowerAtRequest: effectiveLimit,
        managementApprovalUrl: exceedsBorrowingPower ? managementApprovalUrl.trim() : null,
        managementApprovalFileName: exceedsBorrowingPower ? (managementApprovalFileName || 'management_approval') : null,
        managementApprovalNotes: exceedsBorrowingPower ? ((managementApprovalNotes === null || managementApprovalNotes === void 0 ? void 0 : managementApprovalNotes.trim()) || null) : null
    });
    return {
        success: true,
        loanId: loanRef.id,
        isTopUp: Boolean(isTopUp),
        exceedsBorrowingPower: Boolean(exceedsBorrowingPower)
    };
});
/**
 * Allows a member to withdraw their own pending loan application before management review.
 */
exports.withdrawLoanApplication = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const { loanId, reason } = request.data || {};
    if (!loanId)
        throw new https_1.HttpsError('invalid-argument', 'Loan ID is required.');
    const db = admin.firestore();
    const loanRef = db.collection('loans').doc(loanId);
    const loanSnap = await loanRef.get();
    if (!loanSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Loan application not found.');
    }
    const loanData = loanSnap.data();
    // Check ownership or admin
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = (_a = callerSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
    const isOwner = loanData.memberId === request.auth.uid;
    const isAdmin = callerRole === 'admin' || callerRole === 'management';
    if (!isOwner && !isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'You can only withdraw your own loan application.');
    }
    if (loanData.status !== 'requested') {
        throw new https_1.HttpsError('failed-precondition', `Cannot withdraw loan with status '${loanData.status}'. Only pending requests under review can be withdrawn.`);
    }
    const withdrawalReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Withdrawn by applicant';
    const batch = db.batch();
    batch.update(loanRef, {
        status: 'withdrawn',
        withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
        withdrawnBy: request.auth.uid,
        withdrawalReason
    });
    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: request.auth.uid,
        action: 'WITHDRAW_LOAN_APPLICATION',
        justification: withdrawalReason,
        details: {
            loanId,
            memberId: loanData.memberId,
            amount: loanData.amount,
            isTopUp: Boolean(loanData.isTopUp)
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    return {
        success: true,
        loanId,
        status: 'withdrawn'
    };
});
/**
 * Processes a loan approval and generates the legal repayment schedule.
 * Loads authoritative interest rate and terms from settings/financials.
 */
exports.approveLoan = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data();
    if ((userData === null || userData === void 0 ? void 0 : userData.role) !== 'admin' && (userData === null || userData === void 0 ? void 0 : userData.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Management authority required.');
    }
    const { loanId, terms = {}, justification } = request.data;
    const { durationMonths = 12, startDate: startDateStr, checkUrl = '' } = terms;
    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists)
            throw new https_1.HttpsError('not-found', 'Loan record not found.');
        const loanData = loanSnap.data();
        if (loanData.status !== 'requested') {
            throw new https_1.HttpsError('failed-precondition', `Loan is currently in '${loanData.status}' status, cannot be approved.`);
        }
        // Authoritatively fetch policy settings from Firestore
        const settingsSnap = await db.collection('settings').doc('financials').get();
        const settings = settingsSnap.data() || {};
        const globalRate = Number(settings.loanInterestRate) || 10;
        const penaltyRate = Number(settings.penaltyRate) || 2;
        const interestType = settings.interestType || 'afterward';
        // Authoritative interest calculation on the server
        const interestAmount = Math.round(loanData.amount * (globalRate / 100));
        const startDate = startDateStr ? new Date(startDateStr) : new Date();
        const interestToAddToRepayment = interestType === 'afterward' ? interestAmount : 0;
        const totalBalance = loanData.amount + interestToAddToRepayment;
        const netDisbursed = interestType === 'immediate' ? (loanData.amount - interestAmount) : loanData.amount;
        const schedule = (0, loan_schedules_1.calculateAmortizationSchedule)(loanData.amount, interestToAddToRepayment, Number(durationMonths) || 12, startDate);
        const batch = db.batch();
        batch.update(loanRef, {
            status: 'approved',
            startDate: admin.firestore.Timestamp.fromDate(startDate),
            interestAmount,
            interestType,
            penaltyRate,
            balance: totalBalance,
            netDisbursed,
            durationMonths: Number(durationMonths) || 12,
            amortization: schedule,
            checkUrl,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: request.auth.uid
        });
        batch.update(db.collection('users').doc(loanData.memberId), {
            amortizationSchedule: schedule
        });
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'APPROVE_LOAN',
            justification,
            details: {
                loanId,
                memberId: loanData.memberId,
                principal: loanData.amount,
                interest: interestAmount,
                rate: globalRate,
                interestType,
                netDisbursed
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Records a member repayment request.
 * Status is set to 'pending' and does NOT update loan balance until verified.
 */
exports.recordRepayment = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const { loanId, amount, proofUrl, justification } = request.data;
    if (!loanId || !amount || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Valid Loan ID and positive amount are required.');
    }
    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists)
            throw new https_1.HttpsError('not-found', 'Loan record not found.');
        const loanData = loanSnap.data();
        if (loanData.memberId !== request.auth.uid) {
            const adminSnap = await db.collection('users').doc(request.auth.uid).get();
            if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin' && ((_b = adminSnap.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'management') {
                throw new https_1.HttpsError('permission-denied', 'You can only pay for your own loans.');
            }
        }
        const repaymentRef = db.collection('repayments').doc();
        await repaymentRef.set({
            loanId,
            memberId: loanData.memberId,
            amount: Number(amount),
            date: admin.firestore.FieldValue.serverTimestamp(),
            proofUrl,
            status: 'pending',
            submittedBy: request.auth.uid,
            justification: justification || 'Manual member repayment submission'
        });
        return { success: true, repaymentId: repaymentRef.id };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Verifies a pending repayment and officially updates the loan balance.
 */
exports.verifyRepayment = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin' && ((_b = adminSnap.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Unauthorized personnel.');
    }
    const { repaymentId, justification } = request.data;
    try {
        const repayRef = db.collection('repayments').doc(repaymentId);
        const repaySnap = await repayRef.get();
        if (!repaySnap.exists || ((_c = repaySnap.data()) === null || _c === void 0 ? void 0 : _c.status) !== 'pending') {
            throw new https_1.HttpsError('failed-precondition', 'Repayment not found or already processed.');
        }
        const repayData = repaySnap.data();
        const loanRef = db.collection('loans').doc(repayData.loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists)
            throw new https_1.HttpsError('not-found', 'Associated loan not found.');
        const loanData = loanSnap.data();
        const newBalance = Math.max(0, loanData.balance - repayData.amount);
        const batch = db.batch();
        batch.update(repayRef, {
            status: 'verified',
            verifiedBy: request.auth.uid,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            verificationJustification: justification
        });
        batch.update(loanRef, {
            balance: newBalance,
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: newBalance <= 0 ? 'completed' : 'approved'
        });
        // Update the member's amortization schedule if the loan is fully repaid
        if (newBalance <= 0) {
            const userRef = db.collection('users').doc(loanData.memberId);
            const userSnap = await userRef.get();
            const userData = userSnap.data();
            if (userData === null || userData === void 0 ? void 0 : userData.amortizationSchedule) {
                const updatedSchedule = userData.amortizationSchedule.map((inst) => (Object.assign(Object.assign({}, inst), { status: 'paid' })));
                batch.update(userRef, { amortizationSchedule: updatedSchedule });
            }
        }
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'VERIFY_REPAYMENT',
            justification,
            details: { loanId: repayData.loanId, repaymentId, amount: repayData.amount, remainingBalance: newBalance },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Rejects a loan request.
 */
exports.rejectLoan = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin' && ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Management authority required.');
    }
    const { loanId, justification } = request.data;
    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists)
            throw new https_1.HttpsError('not-found', 'Loan record not found.');
        const loanData = loanSnap.data();
        const batch = db.batch();
        batch.update(loanRef, {
            status: 'rejected',
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectionJustification: justification
        });
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'REJECT_LOAN',
            justification,
            details: { loanId, memberId: loanData.memberId, amount: loanData.amount },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=loan-management.js.map