
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculateAmortizationSchedule } from './loan-schedules';

/**
 * Processes a loan approval and generates the legal repayment schedule.
 * Supports deducted interest (one-off at source) and added-on interest.
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
        
        // If interest is deducted immediately, it doesn't add to the balance to be repaid.
        const interestToAddToRepayment = interestType === 'afterward' ? interestAmount : 0;
        const totalBalance = loanData.amount + interestToAddToRepayment;
        const netDisbursed = interestType === 'immediate' ? (loanData.amount - interestAmount) : loanData.amount;

        const schedule = calculateAmortizationSchedule(loanData.amount, interestToAddToRepayment, durationMonths, startDate);

        const batch = db.batch();
        
        // 1. Update Loan Document
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

        // 2. Cache schedule on User document for faster mobile rendering
        batch.update(db.collection('users').doc(loanData.memberId), {
            amortizationSchedule: schedule
        });

        // 3. Secure Audit Log
        batch.set(db.collection('audit_logs').doc(), {
            adminId: request.auth.uid,
            action: 'APPROVE_LOAN',
            justification,
            details: { 
                loanId, 
                memberId: loanData.memberId, 
                principal: loanData.amount, 
                interest: interestAmount, 
                interestType, 
                netDisbursed 
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Rejects a loan request and logs the action for audit.
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
