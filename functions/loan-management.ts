
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculateAmortizationSchedule } from './loan-schedules';
import { createNotification, notifyRoles } from './notification-service';

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

    const applicantName = userSnap.data()?.name || userSnap.data()?.email || 'A member';
    if (isSeniorAcct) {
        await notifyRoles(db, ['reviewer', 'admin'], {
            title: 'Loan Application Awaiting Review',
            message: `${applicantName} (Senior Accountant) submitted a loan application of ${loanAmount.toLocaleString()} RWF. Forwarded for Compliance review.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { loanId: loanRef.id, memberId, amount: loanAmount }
        });
    } else {
        await notifyRoles(db, ['senior_accountant', 'reviewer', 'admin'], {
            title: 'New Loan Application Lodged',
            message: `${applicantName} submitted a loan application of ${loanAmount.toLocaleString()} RWF. Pending review.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { loanId: loanRef.id, memberId, amount: loanAmount }
        });
    }

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

        await createNotification(db, {
            recipientId: loanData.memberId,
            title: 'Loan Facility Approved',
            message: `Your loan application of ${loanData.amount.toLocaleString()} RWF has been approved. Net disbursed: ${netDisbursed.toLocaleString()} RWF.`,
            type: 'loan',
            severity: 'success',
            actionUrl: '/loans',
            metadata: { loanId, amount: loanData.amount }
        });
        await createNotification(db, {
            recipientRole: 'admin',
            title: 'Loan Facility Ratified',
            message: `Loan facility #${loanId.slice(0, 7)} (${loanData.amount.toLocaleString()} RWF) approved and committed to ledger.`,
            type: 'loan',
            severity: 'success',
            actionUrl: '/admin/operations',
            metadata: { loanId, memberId: loanData.memberId }
        });

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

        const callerSnap = await db.collection('users').doc(request.auth.uid).get();
        const callerRole = callerSnap.data()?.role;
        const isSeniorAcct = callerRole === 'senior_accountant';

        const repaymentRef = db.collection('repayments').doc();
        await repaymentRef.set({
            loanId,
            memberId: loanData.memberId,
            amount: Number(amount),
            date: admin.firestore.FieldValue.serverTimestamp(),
            proofUrl,
            status: isSeniorAcct ? 'pending_reviewer' : 'pending',
            seniorReviewed: isSeniorAcct ? true : false,
            seniorReviewedBy: isSeniorAcct ? request.auth.uid : null,
            seniorReviewedAt: isSeniorAcct ? admin.firestore.FieldValue.serverTimestamp() : null,
            seniorReviewJustification: isSeniorAcct ? 'Self-submitted repayment by Senior Accountant (Forwarded directly to Reviewer)' : null,
            submittedBy: request.auth.uid,
            justification: justification || 'Manual member repayment submission'
        });

        await notifyRoles(db, ['senior_accountant', 'reviewer', 'admin'], {
            title: 'Loan Repayment Slip Submitted',
            message: `Repayment slip of ${(Number(amount) || 0).toLocaleString()} RWF uploaded for loan #${loanId.slice(0, 7)}. Pending verification.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { repaymentId: repaymentRef.id, loanId, amount }
        });

        return { success: true, repaymentId: repaymentRef.id };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Reviews a loan repayment (Senior Accountant or Reviewer).
 */
export const reviewRepayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role || 'member';

    if (callerRole !== 'reviewer' && callerRole !== 'senior_accountant' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only designated Reviewers or Senior Accountants can review repayments.');
    }

    const { repaymentId, justification } = request.data;
    if (!repaymentId) throw new HttpsError('invalid-argument', 'Repayment ID is required.');

    const repayRef = db.collection('repayments').doc(repaymentId);
    const repaySnap = await repayRef.get();
    if (!repaySnap.exists) throw new HttpsError('not-found', 'Repayment record not found.');

    const repayData = repaySnap.data()!;
    const isSeniorAcct = callerRole === 'senior_accountant';

    if (isSeniorAcct) {
        if (repayData.memberId === request.auth.uid) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review your own repayment. The Reviewer must review it.');
        }
        if (repayData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'Repayment is currently in ' + repayData.status + ' status, cannot be reviewed.');
        }
        await repayRef.update({
            status: 'pending_reviewer',
            seniorReviewed: true,
            seniorReviewedBy: request.auth.uid,
            seniorReviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            seniorReviewJustification: justification || 'Initial review completed'
        });
    } else {
        // Reviewer or Management
        if (repayData.status !== 'pending_reviewer' && !repayData.seniorReviewed) {
            throw new HttpsError('failed-precondition', 'Reviewers can only review repayments that have been initially reviewed by the Senior Accountant.');
        }
        await repayRef.update({
            status: 'reviewed',
            reviewedBy: request.auth.uid,
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewJustification: justification || 'Compliance review completed'
        });
    }

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_REPAYMENT',
        justification: justification || 'Reviewed',
        details: { repaymentId, loanId: repayData.loanId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (isSeniorAcct) {
        await notifyRoles(db, ['reviewer', 'admin'], {
            title: 'Repayment Endorsed by Senior Reviewer',
            message: `Repayment for loan #${repayData.loanId?.slice(0, 7)} endorsed by Senior Accountant. Pending Compliance review.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { repaymentId, loanId: repayData.loanId }
        });
    } else {
        await createNotification(db, {
            recipientRole: 'admin',
            title: 'Repayment Awaiting Executive Verification',
            message: `Repayment for loan #${repayData.loanId?.slice(0, 7)} endorsed by Reviewer. Ready for final verification and ledger credit.`,
            type: 'loan',
            severity: 'warning',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { repaymentId, loanId: repayData.loanId }
        });
    }

    return { success: true };
});

/**
 * Rejects a loan repayment submission.
 */
export const rejectRepayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'admin' && callerRole !== 'management' && callerRole !== 'senior_accountant' && callerRole !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Unauthorized personnel.');
    }

    const { repaymentId, rejectionReason } = request.data;
    if (!repaymentId || !rejectionReason) {
        throw new HttpsError('invalid-argument', 'Repayment ID and rejection reason are required.');
    }

    const repayRef = db.collection('repayments').doc(repaymentId);
    const repaySnap = await repayRef.get();
    if (!repaySnap.exists) throw new HttpsError('not-found', 'Repayment record not found.');

    const repayData = repaySnap.data()!;

    await repayRef.update({
        status: 'rejected',
        rejectedBy: request.auth.uid,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: rejectionReason.trim()
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REJECT_REPAYMENT',
        justification: rejectionReason,
        details: { repaymentId },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    if (repayData.memberId) {
        await createNotification(db, {
            recipientId: repayData.memberId,
            title: 'Loan Repayment Slip Declined',
            message: `Your repayment slip for loan #${repayData.loanId?.slice(0, 7)} was declined. Reason: ${rejectionReason.trim()}`,
            type: 'loan',
            severity: 'destructive',
            actionUrl: '/loans',
            metadata: { repaymentId, loanId: repayData.loanId }
        });
    }

    return { success: true };
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
        if (!repaySnap.exists || repaySnap.data()?.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', 'Repayment not found, awaiting reviewer completion, or already processed.');
        }

        const repayData = repaySnap.data()!;
        if (repayData.memberId === request.auth.uid && repayData.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', 'Self-repayment must be reviewed by Senior Accountant and Reviewer before approval.');
        }
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

        await createNotification(db, {
            recipientId: loanData.memberId,
            title: 'Loan Repayment Verified',
            message: `Your repayment of ${(Number(repayData.amount) || 0).toLocaleString()} RWF for loan #${repayData.loanId.slice(0, 7)} has been verified and applied to your balance. Remaining balance: ${newBalance.toLocaleString()} RWF.`,
            type: 'loan',
            severity: 'success',
            actionUrl: '/loans',
            metadata: { repaymentId, loanId: repayData.loanId, amount: repayData.amount }
        });
        await createNotification(db, {
            recipientRole: 'admin',
            title: 'Repayment Reconciliation Logged',
            message: `Repayment of ${(Number(repayData.amount) || 0).toLocaleString()} RWF verified for loan #${repayData.loanId.slice(0, 7)}.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/operations',
            metadata: { repaymentId, loanId: repayData.loanId }
        });

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

        await createNotification(db, {
            recipientId: loanData.memberId,
            title: 'Loan Application Declined',
            message: `Your loan application of ${(Number(loanData.amount) || 0).toLocaleString()} RWF was not approved. Reason: ${justification || 'Declined by administration'}`,
            type: 'loan',
            severity: 'destructive',
            actionUrl: '/loans',
            metadata: { loanId }
        });

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
        if (loanData.status === 'pending_member_confirmation' || loanData.memberConfirmed === false) {
            throw new HttpsError('failed-precondition', 'Cannot review loan before the member has confirmed its details.');
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

    if (isSeniorAcct) {
        await notifyRoles(db, ['reviewer', 'admin'], {
            title: 'Loan Endorsed by Senior Reviewer',
            message: `Loan application #${loanId.slice(0, 7)} has passed initial review by Senior Accountant and awaits compliance review.`,
            type: 'loan',
            severity: 'info',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { loanId }
        });
    } else {
        await createNotification(db, {
            recipientRole: 'admin',
            title: 'Loan Awaiting Executive Approval',
            message: `Loan application #${loanId.slice(0, 7)} endorsed by Compliance Reviewer. Ready for final approval and disbursement.`,
            type: 'loan',
            severity: 'warning',
            actionUrl: '/admin/approvals?tab=loans',
            metadata: { loanId }
        });
    }

    return { success: true };
});

/**
 * Initiates bulk legacy/existing loans into the computerized system.
 * Restricted strictly to Senior Accountant.
 * Created in 'pending_member_confirmation' status awaiting borrower confirmation.
 */
export const initiateBulkLoans = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'senior_accountant') {
        throw new HttpsError('permission-denied', 'Only Senior Accountants can enter bulk loans.');
    }

    const { loans: loanItems, justification } = request.data || {};
    if (!Array.isArray(loanItems) || loanItems.length === 0) {
        throw new HttpsError('invalid-argument', 'A list of loans is required.');
    }

    if (loanItems.length > 500) {
        throw new HttpsError('invalid-argument', 'Maximum 500 loans per batch.');
    }

    const batchId = `bulk_loan_${Date.now()}`;
    const batch = db.batch();
    const createdLoanIds: string[] = [];

    for (let i = 0; i < loanItems.length; i++) {
        const item = loanItems[i];
        const memberId = item.memberId?.trim();
        const amount = Number(item.amount);
        const durationMonths = Number(item.durationMonths) || 12;
        const description = item.description?.trim() || 'Computerized bulk loan record';

        if (!memberId) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} is missing a memberId.`);
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} has an invalid amount (${item.amount}).`);
        }

        const loanRef = db.collection('loans').doc();
        batch.set(loanRef, {
            memberId,
            amount,
            description,
            status: 'pending_member_confirmation',
            memberConfirmed: false,
            isBulkLoan: true,
            batchId,
            durationMonths,
            balance: 0,
            interestAmount: 0,
            penaltyRate: 0,
            isTopUp: false,
            seniorReviewed: false,
            complianceReviewed: false,
            enteredBy: request.auth.uid,
            enteredByName: callerData?.name || callerData?.email || 'Senior Accountant',
            requestDate: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdLoanIds.push(loanRef.id);
    }

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: request.auth.uid,
        action: 'INITIATE_BULK_LOANS',
        justification: justification?.trim() || 'Senior Accountant entered bulk loans',
        details: { batchId, count: loanItems.length, loanIds: createdLoanIds },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return {
        success: true,
        batchId,
        count: createdLoanIds.length
    };
});

/**
 * Confirms details of a bulk entered loan by the ordinary member.
 * Transitions loan from 'pending_member_confirmation' to 'requested' for Senior Accountant review.
 */
export const confirmLoanDetails = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { loanId, notes } = request.data || {};
    if (!loanId) throw new HttpsError('invalid-argument', 'Loan ID is required.');

    const db = admin.firestore();
    const loanRef = db.collection('loans').doc(loanId);
    const loanSnap = await loanRef.get();

    if (!loanSnap.exists) {
        throw new HttpsError('not-found', 'Loan record not found.');
    }

    const loanData = loanSnap.data()!;
    if (loanData.memberId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'You can only confirm your own loan details.');
    }

    if (loanData.status !== 'pending_member_confirmation') {
        throw new HttpsError('failed-precondition', 'Loan is not awaiting member confirmation.');
    }

    const batch = db.batch();
    batch.update(loanRef, {
        status: 'requested',
        memberConfirmed: true,
        memberConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        memberConfirmationNotes: notes?.trim() || 'Confirmed by borrower'
    });

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: request.auth.uid,
        action: 'CONFIRM_LOAN_DETAILS',
        justification: notes?.trim() || 'Borrower confirmed loan details',
        details: { loanId, memberId: request.auth.uid, amount: loanData.amount },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { success: true, loanId };
});

