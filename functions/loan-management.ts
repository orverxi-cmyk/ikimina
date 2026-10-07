
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculateAmortizationSchedule } from './loan-schedules';

/**
 * Calculates authoritative institutional liquidity and lending pool metrics.
 * Gross Capital = Verified Member Savings + Total Realized Loan Interest
 * Net Total Assets = Math.max(0, Gross Capital - Approved Operating Expenses)
 * Max Lending Pool = Math.round((Net Total Assets * maxLendingPoolPercentage) / 100)
 * Current Active Loans = Sum of balance of all loans where status === 'approved' && balance > 0
 * Available Lending Pool = Math.max(0, Max Lending Pool - Current Active Loans)
 */
export async function getInstitutionalLendingPool(db: admin.firestore.Firestore) {
    const settingsSnap = await db.collection('settings').doc('financials').get();
    const settings = settingsSnap.data() || {};
    const maxLendingPoolPercentage = Number(settings.maxLendingPoolPercentage) || 90;
    const currency = settings.currency || 'RWF';

    // 1. Total verified savings
    const contribsSnap = await db.collection('contributions').where('status', '==', 'verified').get();
    let totalVerifiedSavings = 0;
    contribsSnap.forEach(d => {
        totalVerifiedSavings += Number(d.data().amount) || 0;
    });

    // 2. Total loan interests & Active loan balance
    const loansSnap = await db.collection('loans').get();
    let totalLoanInterests = 0;
    let currentActiveLoanBalance = 0;
    loansSnap.forEach(d => {
        const l = d.data();
        if (l.status === 'approved' || l.status === 'completed' || l.status === 'active') {
            totalLoanInterests += Number(l.interestAmount) || 0;
        }
        if (l.status === 'approved' && (Number(l.balance) || 0) > 0) {
            currentActiveLoanBalance += Number(l.balance) || 0;
        }
    });

    // 3. Approved operating expenses
    const expensesSnap = await db.collection('expenses').where('status', '==', 'approved').get();
    let totalApprovedExpenses = 0;
    expensesSnap.forEach(d => {
        totalApprovedExpenses += Number(d.data().amount) || 0;
    });

    // 4. Net Total Assets
    const grossCapital = totalVerifiedSavings + totalLoanInterests;
    const netTotalAssets = Math.max(0, grossCapital - totalApprovedExpenses);

    // 5. Max Lending Pool & Available Capacity
    const maxLendingPool = Math.round((netTotalAssets * maxLendingPoolPercentage) / 100);
    const availableLendingPool = Math.max(0, maxLendingPool - currentActiveLoanBalance);

    return {
        totalVerifiedSavings,
        totalLoanInterests,
        totalApprovedExpenses,
        grossCapital,
        netTotalAssets,
        maxLendingPoolPercentage,
        maxLendingPool,
        currentActiveLoanBalance,
        availableLendingPool,
        currency
    };
}

/**
 * Callable function to fetch real-time authoritative institutional lending pool capacity.
 */
export const getGroupLiquidityMetrics = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    return await getInstitutionalLendingPool(db);
});

/**
 * Submits a member loan application.
 * Server authoritatively validates:
 * 1. Member authentication
 * 2. Positive amount
 * 3. Settings constraints: minLoanAmount
 * 4. Institutional Lending Pool ceiling (% of Total Assets) & Liquidity guardrail
 * 5. Member verified savings & maxLoanPercentage borrowing limit (with exception justification)
 * 6. No existing active or pending loans
 */
export const requestLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const memberId = request.auth.uid;
    const { 
        amount, 
        description, 
        durationMonths = 12, 
        isTopUp = false, 
        parentLoanId,
        managementApprovalUrl,
        managementApprovalFileName,
        managementApprovalNotes
    } = request.data || {};
    const loanAmount = Number(amount);

    if (!loanAmount || loanAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A valid loan amount greater than 0 is required.');
    }

    // 1. Fetch system settings
    const settingsSnap = await db.collection('settings').doc('financials').get();
    const settings = settingsSnap.data() || {};
    const minLoanAmount = Number(settings.minLoanAmount) || 5000;
    const maxLoanPercentage = Number(settings.maxLoanPercentage) || 200;

    if (loanAmount < minLoanAmount) {
        throw new HttpsError('failed-precondition', `Loan amount must be at least ${minLoanAmount}.`);
    }

    // 2. Authoritative Institutional Liquidity & Lending Pool Ceiling Check
    const pool = await getInstitutionalLendingPool(db);
    if (pool.availableLendingPool < minLoanAmount) {
        throw new HttpsError(
            'failed-precondition',
            `No funds available to loan from. The available lending pool (${pool.availableLendingPool.toLocaleString()} ${pool.currency}) is below the minimum loan threshold of ${minLoanAmount.toLocaleString()} ${pool.currency}. Applications are temporarily suspended.`
        );
    }

    if (loanAmount > pool.availableLendingPool) {
        throw new HttpsError(
            'failed-precondition',
            `Insufficient available liquidity: Requested loan of ${loanAmount.toLocaleString()} ${pool.currency} exceeds the cooperative's available lending pool of ${pool.availableLendingPool.toLocaleString()} ${pool.currency}. A member cannot borrow above the lending pool value.`
        );
    }

    let availableRepaidPrincipal = 0;

    // 2. Validate top-up constraints if applying for a top-up
    if (isTopUp) {
        if (!parentLoanId) {
            throw new HttpsError('invalid-argument', 'Parent active loan ID is required for a loan top-up.');
        }

        const parentLoanRef = db.collection('loans').doc(parentLoanId);
        const parentLoanSnap = await parentLoanRef.get();

        if (!parentLoanSnap.exists) {
            throw new HttpsError('not-found', 'Parent loan record not found.');
        }

        const parentLoanData = parentLoanSnap.data()!;
        if (parentLoanData.memberId !== memberId) {
            throw new HttpsError('permission-denied', 'You can only top up your own active loan.');
        }

        if (parentLoanData.status !== 'approved' || (Number(parentLoanData.balance) || 0) <= 0) {
            throw new HttpsError('failed-precondition', 'Parent loan must be an active approved loan with an outstanding balance.');
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
            throw new HttpsError('failed-precondition', 'You have not repaid any principal on your active loan yet. Make verified repayments to unlock top-up capacity.');
        }

        if (loanAmount > availableRepaidPrincipal) {
            throw new HttpsError('failed-precondition', `Requested top-up amount (${loanAmount}) exceeds your available repaid principal of ${availableRepaidPrincipal}.`);
        }
    }

    // 3. Check for active or pending loans
    const existingLoansSnap = await db.collection('loans')
        .where('memberId', '==', memberId)
        .get();

    for (const doc of existingLoansSnap.docs) {
        const l = doc.data();
        if (l.status === 'requested') {
            throw new HttpsError('already-exists', 'You already have a pending loan request under review. You can withdraw it if you want to change your request.');
        }
        if (!isTopUp && l.status === 'approved' && (Number(l.balance) || 0) > 0) {
            throw new HttpsError('failed-precondition', 'You must fully repay your active loan before requesting a new one, or apply for a loan top-up on repaid principal.');
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
    const accruedInterest = Number(userSnap.data()?.accruedInterest) || 0;
    const totalEquity = totalVerifiedSavings + accruedInterest;

    // Borrowing limit based on policy % of verified savings (e.g. 200%)
    const percentageLimit = Math.round((totalVerifiedSavings * maxLoanPercentage) / 100);
    const equityLimit = Math.round((totalEquity * maxLoanPercentage) / 100);
    const completedLoansCount = existingLoansSnap.docs.filter(d => d.data().status === 'completed').length;
    const trustBonusLimit = (accruedInterest + (completedLoansCount * 10000)) * 2;
    
    const effectiveLimit = Math.max(percentageLimit, equityLimit, trustBonusLimit);

    const exceedsBorrowingPower = loanAmount > effectiveLimit;

    if (exceedsBorrowingPower) {
        if (!managementApprovalUrl || typeof managementApprovalUrl !== 'string' || !managementApprovalUrl.trim()) {
            throw new HttpsError(
                'failed-precondition', 
                `Requested loan amount of ${loanAmount.toLocaleString()} exceeds your standard borrowing power of ${effectiveLimit.toLocaleString()}. You must attach a valid management approval document to proceed.`
            );
        }
    } else {
        if (totalVerifiedSavings <= 0 && totalEquity <= 0 && completedLoansCount === 0) {
            throw new HttpsError('failed-precondition', 'You must have verified savings contributions before requesting a loan, or attach management approval.');
        }

        if (effectiveLimit < minLoanAmount) {
            throw new HttpsError('failed-precondition', `Your current borrowing limit of ${effectiveLimit.toLocaleString()} is below the minimum allowed loan amount of ${minLoanAmount.toLocaleString()}. Attach management approval to apply for this amount.`);
        }
    }

    const userRole = userSnap.data()?.role;
    const isSeniorAcct = userRole === 'senior_accountant';

    // 5. Create loan application
    const loanRef = db.collection('loans').doc();
    await loanRef.set({
        memberId,
        amount: loanAmount,
        description: description || (isTopUp ? `Loan Top-Up against facility #${parentLoanId.slice(0, 7)}` : 'Member capital loan application'),
        status: isSeniorAcct ? 'pending_reviewer' : 'requested',
        seniorReviewed: isSeniorAcct ? true : false,
        seniorReviewedBy: isSeniorAcct ? memberId : null,
        seniorReviewedAt: isSeniorAcct ? admin.firestore.FieldValue.serverTimestamp() : null,
        seniorReviewJustification: isSeniorAcct ? 'Self-applied by Senior Accountant (Forwarded directly to Reviewer for compliance check)' : null,
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
        managementApprovalNotes: exceedsBorrowingPower ? (managementApprovalNotes?.trim() || null) : null
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
export const withdrawLoanApplication = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { loanId, reason } = request.data || {};
    if (!loanId) throw new HttpsError('invalid-argument', 'Loan ID is required.');

    const db = admin.firestore();
    const loanRef = db.collection('loans').doc(loanId);
    const loanSnap = await loanRef.get();

    if (!loanSnap.exists) {
        throw new HttpsError('not-found', 'Loan application not found.');
    }

    const loanData = loanSnap.data()!;

    // Check ownership or admin
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;
    const isOwner = loanData.memberId === request.auth.uid;
    const isAdmin = callerRole === 'admin' || callerRole === 'management';

    if (!isOwner && !isAdmin) {
        throw new HttpsError('permission-denied', 'You can only withdraw your own loan application.');
    }

    if (loanData.status !== 'requested') {
        throw new HttpsError('failed-precondition', `Cannot withdraw loan with status '${loanData.status}'. Only pending requests under review can be withdrawn.`);
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
export const approveLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data();
    
    if (userData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admin can approve loans.');
    }

    const { loanId, terms = {}, justification } = request.data;
    const { durationMonths = 12, startDate: startDateStr, checkUrl = '' } = terms;

    try {
        const loanRef = db.collection('loans').doc(loanId);
        const loanSnap = await loanRef.get();
        if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan record not found.');
        
        const loanData = loanSnap.data()!;
        if (loanData.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', `Loan must be reviewed by a reviewer before approval. Current status: ${loanData.status}`);
        }

        // Authoritatively check institutional lending pool capacity before approving
        const pool = await getInstitutionalLendingPool(db);
        if (pool.availableLendingPool < loanData.amount) {
            throw new HttpsError(
                'failed-precondition', 
                `Cannot approve loan: Insufficient available lending pool. Available pool capacity is ${pool.availableLendingPool.toLocaleString()} ${pool.currency} based on the ${pool.maxLendingPoolPercentage}% ceiling of net assets (${pool.netTotalAssets.toLocaleString()} ${pool.currency}). Approving this ${loanData.amount.toLocaleString()} ${pool.currency} facility would over-allocate funds.`
            );
        }

        // Authoritatively fetch policy settings from Firestore
        const settingsSnap = await db.collection('settings').doc('financials').get();
        const settings = settingsSnap.data() || {};
        const globalRate = Number(settings.loanInterestRate) || 10;
        const penaltyRate = Number(settings.penaltyRate) || 2;
        const interestType = settings.interestType || 'immediate';

        // Authoritative interest calculation on the server:
        // One-off interest is deducted from the approved loan amount.
        // Example: Approved loan = 1,000,000, interest = 100,000.
        // Amount received (disbursed) = 900,000.
        // Payment schedule applies to the total amount (1,000,000).
        const isImmediate = interestType !== 'afterward';
        const interestAmount = Math.round(loanData.amount * (globalRate / 100));
        const startDate = startDateStr ? new Date(startDateStr) : new Date();
        
        const interestToAddToRepayment = isImmediate ? 0 : interestAmount;
        const totalBalance = isImmediate ? loanData.amount : (loanData.amount + interestAmount);
        const netDisbursed = isImmediate ? Math.max(0, loanData.amount - interestAmount) : loanData.amount;

        const schedule = calculateAmortizationSchedule(loanData.amount, interestToAddToRepayment, Number(durationMonths) || 12, startDate);

        const batch = db.batch();
        
        batch.update(loanRef, {
            status: 'approved',
            startDate: admin.firestore.Timestamp.fromDate(startDate),
            interestAmount,
            interestType: isImmediate ? 'immediate' : 'afterward',
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

        const newBalance = Math.max(0, (Number(loanData.balance) || 0) - Number(repayData.amount));
        const batch = db.batch();

        // Retrieve existing schedule or calculate if missing
        let schedule: any[] = Array.isArray(loanData.amortization) && loanData.amortization.length > 0
            ? JSON.parse(JSON.stringify(loanData.amortization))
            : calculateAmortizationSchedule(
                loanData.amount, 
                loanData.interestType === 'afterward' ? (loanData.interestAmount || 0) : 0, 
                Number(loanData.durationMonths) || 12, 
                loanData.startDate ? (loanData.startDate.toDate ? loanData.startDate.toDate() : new Date(loanData.startDate)) : new Date()
              );

        // Sort installments sequentially
        schedule.sort((a: any, b: any) => (Number(a.installmentNumber) || 0) - (Number(b.installmentNumber) || 0));

        let paymentToDistribute = Number(repayData.amount);

        for (const inst of schedule) {
            if (paymentToDistribute <= 0) break;

            const instTarget = Number(inst.amount) || 0;
            const currentPaid = Number(inst.paidAmount) || (inst.status === 'paid' ? instTarget : 0);
            const needed = Math.max(0, instTarget - currentPaid);

            if (needed <= 0) {
                inst.paidAmount = instTarget;
                inst.remainingAmount = 0;
                inst.status = 'paid';
                continue;
            }

            if (paymentToDistribute >= needed) {
                inst.paidAmount = instTarget;
                inst.remainingAmount = 0;
                inst.status = 'paid';
                inst.paidAt = admin.firestore.Timestamp.now();
                paymentToDistribute -= needed;
            } else {
                const updatedPaid = currentPaid + paymentToDistribute;
                inst.paidAmount = updatedPaid;
                inst.remainingAmount = Math.max(0, instTarget - updatedPaid);
                inst.status = 'partially_paid';
                inst.lastPaymentAt = admin.firestore.Timestamp.now();
                paymentToDistribute = 0;
            }
        }

        // If entire loan balance is settled, mark all installments paid
        if (newBalance <= 0) {
            schedule = schedule.map((inst: any) => ({
                ...inst,
                paidAmount: Number(inst.amount) || 0,
                remainingAmount: 0,
                status: 'paid'
            }));
        }

        batch.update(repayRef, {
            status: 'verified',
            verifiedBy: request.auth.uid,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            verificationJustification: justification
        });

        batch.update(loanRef, {
            balance: newBalance,
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: newBalance <= 0 ? 'completed' : 'approved',
            amortization: schedule
        });

        // Sync with member's user document schedule
        const userRef = db.collection('users').doc(loanData.memberId);
        batch.update(userRef, { amortizationSchedule: schedule });

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
    
    if (userSnap.data()?.role !== 'admin' && userSnap.data()?.role !== 'management' && userSnap.data()?.role !== 'senior_accountant' && userSnap.data()?.role !== 'reviewer') {
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


export const reviewLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'senior_accountant' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only designated Reviewers or Senior Accountants can review loans.');
    }

    const { loanId, justification } = request.data;
    if (!loanId) throw new HttpsError('invalid-argument', 'Loan ID is required.');

    const loanRef = db.collection('loans').doc(loanId);
    const loanSnap = await loanRef.get();
    if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan not found.');
    
    const loanData = loanSnap.data()!;
    const isSeniorAcct = callerRole === 'senior_accountant';

    if (isSeniorAcct) {
        if (loanData.memberId === request.auth.uid) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review your own loan application. The Reviewer must review it.');
        }
        if (loanData.status !== 'requested') {
            throw new HttpsError('failed-precondition', 'Loan is currently in ' + loanData.status + ' status, cannot be reviewed.');
        }
        await loanRef.update({
            status: 'pending_reviewer',
            seniorReviewed: true,
            seniorReviewedBy: request.auth.uid,
            seniorReviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            seniorReviewJustification: justification || 'Initial review completed'
        });
    } else {
        // Reviewer or Management: ONLY reviews loans that have been reviewed by Senior Accountant
        if (loanData.status !== 'pending_reviewer' && !loanData.seniorReviewed) {
            throw new HttpsError('failed-precondition', 'Reviewers can only review loan facilities that have been initially reviewed by the Senior Accountant.');
        }
        await loanRef.update({
            status: 'reviewed',
            complianceReviewed: true,
            reviewedBy: request.auth.uid,
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewJustification: justification || 'Compliance review completed'
        });
    }

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_LOAN',
        justification: justification || 'Reviewed loan request',
        details: { loanId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
