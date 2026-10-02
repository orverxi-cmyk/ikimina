
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculateAmortizationSchedule } from './loan-schedules';

/**
 * Submits a member loan application.
 * Server authoritatively validates:
 * 1. Member authentication
 * 2. Positive amount
 * 3. Settings constraints: minLoanAmount and maxLoanAmount
 * 4. Member verified savings & maxLoanPercentage borrowing limit
 * 5. No existing active or pending loans
 */
export const requestLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const memberId = request.auth.uid;
    const { amount, description, durationMonths = 12 } = request.data || {};
    const loanAmount = Number(amount);

    if (!loanAmount || loanAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A valid loan amount greater than 0 is required.');
    }

    // 1. Fetch system settings
    const settingsSnap = await db.collection('settings').doc('financials').get();
    const settings = settingsSnap.data() || {};
    const minLoanAmount = Number(settings.minLoanAmount) || 5000;
    const maxLoanAmount = Number(settings.maxLoanAmount) || 1000000;
    const maxLoanPercentage = Number(settings.maxLoanPercentage) || 200;

    if (loanAmount < minLoanAmount) {
        throw new HttpsError('failed-precondition', `Loan amount must be at least ${minLoanAmount}.`);
    }

    if (loanAmount > maxLoanAmount) {
        throw new HttpsError('failed-precondition', `Loan amount cannot exceed the maximum of ${maxLoanAmount}.`);
    }

    // 2. Check for active or pending loans
    const existingLoansSnap = await db.collection('loans')
        .where('memberId', '==', memberId)
        .get();

    for (const doc of existingLoansSnap.docs) {
        const l = doc.data();
        if (l.status === 'requested') {
            throw new HttpsError('already-exists', 'You already have a pending loan request under review.');
        }
        if (l.status === 'approved' && (Number(l.balance) || 0) > 0) {
            throw new HttpsError('failed-precondition', 'You must fully repay your active loan before requesting a new one.');
        }
    }

    // 3. Compute member's borrowing power based on verified savings and equity
    const contribsSnap = await db.collection('contributions')
        .where('memberId', '==', memberId)
        .where('status', '==', 'verified')
        .get();

    let totalVerifiedSavings = 0;
    contribsSnap.forEach(d => {
        totalVerifiedSavings += Number(d.data().amount) || 0;
    });

    const userSnap = await db.collection('users').doc(memberId).get();
    const accruedInterest = Number(userSnap.data()?.accruedInterest) || 0;
    const totalEquity = totalVerifiedSavings + accruedInterest;

    // Borrowing limit based on policy % of verified savings (e.g. 200%)
    const percentageLimit = Math.round((totalVerifiedSavings * maxLoanPercentage) / 100);
    const equityLimit = Math.round((totalEquity * maxLoanPercentage) / 100);
    const completedLoansCount = existingLoansSnap.docs.filter(d => d.data().status === 'completed').length;
    const trustBonusLimit = (accruedInterest + (completedLoansCount * 10000)) * 2;
    
    const effectiveLimit = Math.min(
        Math.max(percentageLimit, equityLimit, trustBonusLimit),
        maxLoanAmount
    );

    if (totalVerifiedSavings <= 0 && totalEquity <= 0 && completedLoansCount === 0) {
        throw new HttpsError('failed-precondition', 'You must have verified savings contributions before requesting a loan.');
    }

    if (effectiveLimit < minLoanAmount) {
        throw new HttpsError('failed-precondition', `Your current borrowing limit of ${effectiveLimit} is below the minimum allowed loan amount of ${minLoanAmount}.`);
    }

    if (loanAmount > effectiveLimit) {
        throw new HttpsError('failed-precondition', `Requested amount exceeds your borrowing power limit of ${effectiveLimit}.`);
    }

    // 4. Create loan application
    const loanRef = db.collection('loans').doc();
    await loanRef.set({
        memberId,
        amount: loanAmount,
        description: description || 'Member capital loan application',
        status: 'requested',
        requestDate: admin.firestore.FieldValue.serverTimestamp(),
        balance: 0,
        interestAmount: 0,
        penaltyRate: 0,
        durationMonths: Number(durationMonths) || 12,
    });

    return { success: true, loanId: loanRef.id };
});

/**
 * Processes a loan approval and generates the legal repayment schedule.
 * Loads authoritative interest rate and terms from settings/financials.
 */
export const approveLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Management authority required.');
    }

    const { loanId, terms = {}, justification } = request.data;
    const { durationMonths = 12, startDate: startDateStr, checkUrl = '' } = terms;

    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan record not found.');
        
        const loanData = loanSnap.data()!;
        if (loanData.status !== 'requested') {
            throw new HttpsError('failed-precondition', `Loan is currently in '${loanData.status}' status, cannot be approved.`);
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

        const schedule = calculateAmortizationSchedule(loanData.amount, interestToAddToRepayment, Number(durationMonths) || 12, startDate);

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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Records a member repayment request. 
 * Status is set to 'pending' and does NOT update loan balance until verified.
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Verifies a pending repayment and officially updates the loan balance.
 */
export const verifyRepayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin' && adminSnap.data()?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Unauthorized personnel.');
    }

    const { repaymentId, justification } = request.data;

    try {
        const repayRef = db.collection('repayments').doc(repaymentId);
        const repaySnap = await repayRef.get();
        if (!repaySnap.exists || repaySnap.data()?.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'Repayment not found or already processed.');
        }

        const repayData = repaySnap.data()!;
        const loanRef = db.collection('loans').doc(repayData.loanId);
        const loanSnap = await loanRef.get();
        
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Associated loan not found.');
        const loanData = loanSnap.data()!;

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
            
            if (userData?.amortizationSchedule) {
                const updatedSchedule = userData.amortizationSchedule.map((inst: any) => ({
                    ...inst,
                    status: 'paid'
                }));
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
