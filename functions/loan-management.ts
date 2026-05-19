
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculateAmortizationSchedule } from './loan-schedules';

/**
 * Processes a loan approval and generates the legal repayment schedule.
 */
export const approveLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Management authority required.');
    }

    const { loanId, terms, justification } = request.data;
    const { interestAmount, durationMonths, startDate: startDateStr, interestType, checkUrl, penaltyRate } = terms;

    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan record not found.');
        
        const loanData = loanSnap.data()!;
        const startDate = new Date(startDateStr);
        
        const interestToAddToRepayment = interestType === 'afterward' ? interestAmount : 0;
        const totalBalance = loanData.amount + interestToAddToRepayment;
        const netDisbursed = interestType === 'immediate' ? (loanData.amount - interestAmount) : loanData.amount;

        const schedule = calculateAmortizationSchedule(loanData.amount, interestToAddToRepayment, durationMonths, startDate);

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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Records a member repayment and updates the loan balance.
 */
export const recordRepayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const { loanId, amount, proofUrl, justification } = request.data;

    if (!loanId || !amount || amount <= 0) {
        throw new HttpsError('invalid-argument', 'Valid Loan ID and positive amount are required.');
    }

    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan record not found.');
        
        const loanData = loanSnap.data()!;
        if (loanData.memberId !== request.auth.uid) {
            const adminSnap = await db.collection('users').doc(request.auth.uid).get();
            if (adminSnap.data()?.role !== 'admin' && adminSnap.data()?.role !== 'management') {
                throw new HttpsError('permission-denied', 'You can only pay for your own loans.');
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Rejects a loan request.
 */
export const rejectLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (userSnap.data()?.role !== 'admin' && userSnap.data()?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Management authority required.');
    }

    const { loanId, justification } = request.data;

    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan record not found.');
        
        const loanData = loanSnap.data()!;
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});
