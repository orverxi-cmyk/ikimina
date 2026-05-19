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
exports.rejectLoan = exports.recordRepayment = exports.approveLoan = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const loan_schedules_1 = require("./loan-schedules");
/**
 * Processes a loan approval and generates the legal repayment schedule.
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
    const { loanId, terms, justification } = request.data;
    const { interestAmount, durationMonths, startDate: startDateStr, interestType, checkUrl, penaltyRate } = terms;
    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists)
            throw new https_1.HttpsError('not-found', 'Loan record not found.');
        const loanData = loanSnap.data();
        const startDate = new Date(startDateStr);
        const interestToAddToRepayment = interestType === 'afterward' ? interestAmount : 0;
        const totalBalance = loanData.amount + interestToAddToRepayment;
        const netDisbursed = interestType === 'immediate' ? (loanData.amount - interestAmount) : loanData.amount;
        const schedule = (0, loan_schedules_1.calculateAmortizationSchedule)(loanData.amount, interestToAddToRepayment, durationMonths, startDate);
        const batch = db.batch();
        batch.update(loanRef, {
            status: 'approved',
            startDate: admin.firestore.Timestamp.fromDate(startDate),
            interestAmount,
            interestType,
            penaltyRate,
            balance: totalBalance,
            netDisbursed,
            durationMonths,
            amortization: schedule,
            checkUrl,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.update(db.collection('users').doc(loanData.memberId), {
            amortizationSchedule: schedule
        });
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'APPROVE_LOAN',
            justification,
            details: { loanId, memberId: loanData.memberId, principal: loanData.amount, interest: interestAmount, interestType, netDisbursed },
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
 * Records a member repayment and updates the loan balance.
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
        const newBalance = Math.max(0, loanData.balance - amount);
        const batch = db.batch();
        // 1. Record Repayment
        const repaymentRef = db.collection('repayments').doc();
        batch.set(repaymentRef, {
            loanId,
            memberId: loanData.memberId,
            amount: Number(amount),
            date: admin.firestore.FieldValue.serverTimestamp(),
            proofUrl,
            status: 'pending' // Awaiting verification
        });
        // 2. Update Loan Balance (Optimistic but verified on server)
        batch.update(loanRef, {
            balance: newBalance,
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: newBalance <= 0 ? 'completed' : 'approved'
        });
        // 3. Audit Log
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'RECORD_REPAYMENT',
            justification: justification || 'Manual member repayment submission',
            details: { loanId, amount, remainingBalance: newBalance },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true, remainingBalance: newBalance };
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