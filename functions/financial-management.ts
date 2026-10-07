
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Allocates accumulated interest (profit) to members based on their 
 * pro-rata contribution weight in the total pool.
 */
export const allocateInterest = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const adminUid = request.auth.uid;
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(adminUid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can allocate interest.');
    }

    const { totalInterestToDistribute, justification } = request.data;
    if (!totalInterestToDistribute || totalInterestToDistribute <= 0) {
        throw new HttpsError('invalid-argument', 'A positive interest amount is required.');
    }

    try {
        // 1. Calculate Total Realized Group Interest from Loans
        const loansSnap = await db.collection('loans').get();
        let totalRealizedInterest = 0;
        loansSnap.forEach(doc => {
            const loan = doc.data();
            if (loan.status === 'completed' || loan.status === 'approved') {
                totalRealizedInterest += Number(loan.interestAmount) || 0;
            }
        });

        // 2. Calculate Previously Distributed Group Interest
        const auditSnap = await db.collection('audit_logs').where('action', '==', 'ALLOCATE_INTEREST').get();
        let previouslyDistributed = 0;
        auditSnap.forEach(doc => {
            previouslyDistributed += Number(doc.data()?.details?.totalDistributed) || 0;
        });

        // 3. Available Undistributed Profit Guardrail
        const availableToDistribute = Math.max(0, totalRealizedInterest - previouslyDistributed);
        if (totalInterestToDistribute > availableToDistribute) {
            throw new HttpsError(
                'failed-precondition', 
                `Cannot distribute ${totalInterestToDistribute}. Available undistributed profit is ${availableToDistribute} (Total Earned: ${totalRealizedInterest}, Already Distributed: ${previouslyDistributed}).`
            );
        }

        // 4. Calculate Member Contribution Totals
        const contribsSnap = await db.collection('contributions').get();
        const memberTotals: { [memberId: string]: number } = {};
        let totalPool = 0;

        contribsSnap.forEach(doc => {
            const data = doc.data();
            // Only count verified contributions
            if (data.status === 'verified') {
                const amount = Number(data.amount) || 0;
                const memberId = data.memberId;
                memberTotals[memberId] = (memberTotals[memberId] || 0) + amount;
                totalPool += amount;
            }
        });

        if (totalPool === 0) throw new HttpsError('failed-precondition', 'Total contribution pool is empty.');

        const membersSnap = await db.collection('users').get();
        const batch = db.batch();
        const distRef = db.collection('interest_distributions').doc();
        const currentPeriod = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

        let recipientsCount = 0;
        let capitalizedCount = 0;
        let cashPayoutCount = 0;
        let totalCapitalizedToContributions = 0;
        let totalCashPayout = 0;
        const breakdown: any[] = [];

        membersSnap.forEach(memberDoc => {
            const memberId = memberDoc.id;
            const memberData = memberDoc.data();
            const memberTotal = memberTotals[memberId] || 0;
            const previousAccruedInterest = Number(memberData.accruedInterest) || 0;
            
            // Read member's payout election preference (default: receive_payout)
            const preference = memberData.interestPayoutPreference || memberData.payoutPreference || 'receive_payout';
            
            if (memberTotal > 0) {
                const shareRatio = memberTotal / totalPool;
                const memberShare = Math.floor(totalInterestToDistribute * shareRatio);
                
                if (memberShare > 0) {
                    if (preference === 'add_to_contribution') {
                        // EXCLUDED from cash payout. Credited directly as a verified contribution to their total contributions!
                        const contribRef = db.collection('contributions').doc();
                        batch.set(contribRef, {
                            memberId,
                            amount: memberShare,
                            period: currentPeriod,
                            date: admin.firestore.FieldValue.serverTimestamp(),
                            proofUrl: '',
                            status: 'verified',
                            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                            verifiedBy: adminUid,
                            justification: `Interest profit capitalized into total savings (Distribution ${distRef.id})`,
                            type: 'interest_reinvestment'
                        });

                        totalCapitalizedToContributions += memberShare;
                        capitalizedCount++;

                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            distributedShare: memberShare,
                            payoutType: 'add_to_contribution',
                            outcome: 'Added to Total Contribution Savings',
                            previousAccruedInterest,
                            newTotalAccruedInterest: previousAccruedInterest
                        });
                    } else {
                        // Received as Payout / Accrued Interest
                        batch.update(memberDoc.ref, {
                            accruedInterest: admin.firestore.FieldValue.increment(memberShare)
                        });

                        totalCashPayout += memberShare;
                        cashPayoutCount++;

                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            distributedShare: memberShare,
                            payoutType: 'receive_payout',
                            outcome: 'Accrued for Liquid Cash Payout',
                            previousAccruedInterest,
                            newTotalAccruedInterest: previousAccruedInterest + memberShare
                        });
                    }
                    recipientsCount++;
                }
            }
        });

        // 5. Permanent Ledger Entry in interest_distributions
        batch.set(distRef, {
            distributedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminId: request.auth.uid,
            amountDistributed: totalInterestToDistribute,
            totalPool,
            totalRealizedInterest,
            previouslyDistributed,
            availableBeforeDistribution: availableToDistribute,
            availableAfterDistribution: availableToDistribute - totalInterestToDistribute,
            justification,
            recipientsCount,
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout,
            breakdown
        });

        // 6. Audit Log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'ALLOCATE_INTEREST',
            justification,
            details: { 
                distributionId: distRef.id,
                totalDistributed: totalInterestToDistribute, 
                totalPool,
                recipientsCount,
                capitalizedCount,
                cashPayoutCount,
                totalCapitalizedToContributions,
                totalCashPayout,
                availableAfter: availableToDistribute - totalInterestToDistribute
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 7. Conclude active payout campaign in settings if open
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            payoutCampaign: {
                status: 'closed',
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastDistributionId: distRef.id,
                lastDistributionAmount: totalInterestToDistribute
            }
        }, { merge: true });

        await batch.commit();
        return { 
            success: true, 
            recipients: recipientsCount, 
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout,
            availableAfter: availableToDistribute - totalInterestToDistribute,
            distributionId: distRef.id 
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Step 1: Accountant or Authorized Officer initiates an Interest Distribution Proposal.
 * Computes pro-rata breakdown, checks available pool guardrails, and stages request in pending state.
 */
export const initiateInterestDistribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const callerUid = request.auth.uid;
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const callerData = callerSnap.data();

    if (callerData?.role !== 'accountant' && callerData?.role !== 'senior_accountant') {
        throw new HttpsError('permission-denied', 'Only Accountants or Senior Accountants can initiate an interest distribution proposal. Administrators cannot initiate proposals.');
    }

    const { totalInterestToDistribute, justification } = request.data || {};
    const parsedAmount = Number(totalInterestToDistribute);
    if (!parsedAmount || parsedAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A positive interest distribution amount is required.');
    }

    if (!justification || typeof justification !== 'string' || !justification.trim()) {
        throw new HttpsError('invalid-argument', 'Audit justification and resolution notes are required.');
    }

    try {
        // 1. Calculate Realized Group Interest from Loans
        const loansSnap = await db.collection('loans').get();
        let totalRealizedInterest = 0;
        loansSnap.forEach(doc => {
            const loan = doc.data();
            if (loan.status === 'completed' || loan.status === 'approved') {
                totalRealizedInterest += Number(loan.interestAmount) || 0;
            }
        });

        // 2. Calculate Previously Distributed Group Interest
        const auditSnap = await db.collection('audit_logs').where('action', '==', 'ALLOCATE_INTEREST').get();
        let previouslyDistributed = 0;
        auditSnap.forEach(doc => {
            previouslyDistributed += Number(doc.data()?.details?.totalDistributed) || 0;
        });

        // 3. Available Undistributed Profit Guardrail
        const availableToDistribute = Math.max(0, totalRealizedInterest - previouslyDistributed);
        if (parsedAmount > availableToDistribute) {
            throw new HttpsError(
                'failed-precondition', 
                `Cannot distribute ${parsedAmount}. Available undistributed profit is ${availableToDistribute} (Total Earned: ${totalRealizedInterest}, Already Distributed: ${previouslyDistributed}).`
            );
        }

        // 4. Calculate Member Contribution Totals
        const contribsSnap = await db.collection('contributions').get();
        const memberTotals: { [memberId: string]: number } = {};
        let totalPool = 0;

        contribsSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'verified') {
                const amount = Number(data.amount) || 0;
                const memberId = data.memberId;
                memberTotals[memberId] = (memberTotals[memberId] || 0) + amount;
                totalPool += amount;
            }
        });

        if (totalPool === 0) throw new HttpsError('failed-precondition', 'Total contribution pool is empty.');

        const membersSnap = await db.collection('users').get();
        let recipientsCount = 0;
        let capitalizedCount = 0;
        let cashPayoutCount = 0;
        let totalCapitalizedToContributions = 0;
        let totalCashPayout = 0;
        const breakdown: any[] = [];

        membersSnap.forEach(memberDoc => {
            const memberId = memberDoc.id;
            const memberData = memberDoc.data();
            const memberTotal = memberTotals[memberId] || 0;
            const previousAccruedInterest = Number(memberData.accruedInterest) || 0;
            const preference = memberData.interestPayoutPreference || memberData.payoutPreference || 'receive_payout';

            if (memberTotal > 0) {
                const shareRatio = memberTotal / totalPool;
                const memberShare = Math.floor(parsedAmount * shareRatio);

                if (memberShare > 0) {
                    if (preference === 'add_to_contribution') {
                        totalCapitalizedToContributions += memberShare;
                        capitalizedCount++;
                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            sharePercentage: ((shareRatio * 100).toFixed(2)),
                            distributedShare: memberShare,
                            payoutType: 'add_to_contribution',
                            outcome: 'Added to Total Contribution Savings',
                            previousAccruedInterest,
                            projectedSavings: memberTotal + memberShare,
                            projectedAccruedInterest: previousAccruedInterest
                        });
                    } else {
                        totalCashPayout += memberShare;
                        cashPayoutCount++;
                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            sharePercentage: ((shareRatio * 100).toFixed(2)),
                            distributedShare: memberShare,
                            payoutType: 'receive_payout',
                            outcome: 'Accrued for Liquid Cash Payout',
                            previousAccruedInterest,
                            projectedSavings: memberTotal,
                            projectedAccruedInterest: previousAccruedInterest + memberShare
                        });
                    }
                    recipientsCount++;
                }
            }
        });

        const reqRef = db.collection('interest_distribution_requests').doc();
        const requestPayload = {
            id: reqRef.id,
            status: 'pending_review',
            totalInterestToDistribute: parsedAmount,
            totalPool,
            totalRealizedInterest,
            previouslyDistributed,
            availableBeforeDistribution: availableToDistribute,
            justification: justification.trim(),
            recipientsCount,
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout,
            breakdown,
            initiatedBy: callerUid,
            initiatedByName: callerData?.name || callerData?.email || 'Initiator',
            initiatedByEmail: callerData?.email || request.auth.token.email || '',
            initiatedByRole: callerData?.role || 'accountant',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        batch.set(reqRef, requestPayload);

        // Open payout campaign in settings so members receive notification and payout preference selection
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            payoutCampaign: {
                status: 'open',
                targetAmount: parsedAmount,
                announcement: justification.trim() || 'Management has initiated an interest distribution. Please select whether you want your dividend added to your savings or received as cash.',
                openedAt: admin.firestore.FieldValue.serverTimestamp(),
                openedBy: callerUid,
                pendingRequestId: reqRef.id
            }
        }, { merge: true });

        // Audit Log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: callerUid,
            action: 'INITIATE_INTEREST_DISTRIBUTION',
            justification: justification.trim(),
            details: {
                requestId: reqRef.id,
                totalInterestToDistribute: parsedAmount,
                recipientsCount,
                totalPool
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        return {
            success: true,
            requestId: reqRef.id,
            totalInterestToDistribute: parsedAmount,
            recipientsCount,
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Step 2: Reviewer or Senior Accountant reviews the interest distribution proposal and member preference campaign.
 * Endorsement advances proposal to 'pending_approval' for Administrator approval.
 */
export const reviewInterestDistribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const callerUid = request.auth.uid;

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    const allowedRoles = ['reviewer', 'senior_accountant', 'management'];
    if (!allowedRoles.includes(callerRole)) {
        throw new HttpsError('permission-denied', 'Only Reviewers or Senior Accountants can review interest distribution proposals. Administrators cannot review proposals.');
    }

    const { requestId, decision, reviewNotes } = request.data || {};
    if (!requestId) {
        throw new HttpsError('invalid-argument', 'Distribution request ID is required.');
    }
    if (!decision || !['endorse', 'request_changes', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid review decision (endorse, request_changes, reject) is required.');
    }

    const reqRef = db.collection('interest_distribution_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Interest distribution request not found.');
    }

    const reqData = reqSnap.data()!;
    const isSeniorAcct = callerRole === 'senior_accountant';

    if (isSeniorAcct) {
        if (reqData.status !== 'pending_review' && reqData.status !== 'pending' && reqData.status !== 'revision_requested') {
            throw new HttpsError('failed-precondition', `Cannot perform initial review on distribution proposal with status '${reqData.status}'.`);
        }
    } else {
        // Reviewer or Management: ONLY reviews proposals that have been reviewed by Senior Accountant
        if (reqData.status !== 'pending_reviewer' && !reqData.seniorReviewed) {
            throw new HttpsError('failed-precondition', 'Reviewers can only review interest proposals that have been initiated and initially reviewed by the Senior Accountant.');
        }
        if (reqData.initiatedBy === callerUid) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review a proposal you initiated. Another authorized officer must review it.');
        }
    }

    let nextStatus = isSeniorAcct ? 'pending_reviewer' : 'pending_approval';
    let actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_INTEREST_ENDORSED' : 'REVIEW_INTEREST_DISTRIBUTION_ENDORSED';
    if (decision === 'request_changes') {
        nextStatus = 'revision_requested';
        actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_INTEREST_REVISION_REQUESTED' : 'REVIEW_INTEREST_DISTRIBUTION_REVISION_REQUESTED';
    } else if (decision === 'reject') {
        nextStatus = 'rejected';
        actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_INTEREST_REJECTED' : 'REVIEW_INTEREST_DISTRIBUTION_REJECTED';
    }

    const reviewerName = callerData?.name || callerData?.email || (isSeniorAcct ? 'Senior Accountant' : 'Reviewer');

    const updatePayload: any = {
        status: nextStatus
    };

    if (isSeniorAcct) {
        updatePayload.seniorReviewed = true;
        updatePayload.seniorReviewedBy = callerUid;
        updatePayload.seniorReviewedByName = reviewerName;
        updatePayload.seniorReviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.seniorReviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    } else {
        updatePayload.complianceReviewed = true;
        updatePayload.reviewedBy = callerUid;
        updatePayload.reviewedByName = reviewerName;
        updatePayload.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.reviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    }

    await reqRef.update(updatePayload);

    await db.collection('audit_logs').add({
        action: actionName,
        performedBy: callerUid,
        performedByName: reviewerName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            requestId,
            decision,
            nextStatus,
            reviewNotes: reviewNotes || null
        }
    });

    return {
        success: true,
        requestId,
        status: nextStatus
    };
});

/**
 * Step 3: Administrator Approves and Commits the Interest Distribution.
 * Dual-Control Rule strictly enforced: The initiator CANNOT approve their own distribution request.
 */
export const approveInterestDistribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const approverUid = request.auth.uid;
    
    const db = admin.firestore();
    const approverSnap = await db.collection('users').doc(approverUid).get();
    const approverData = approverSnap.data();

    if (approverData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only a verified Administrator can approve interest distribution.');
    }

    const { requestId, approvalNotes } = request.data || {};
    if (!requestId) {
        throw new HttpsError('invalid-argument', 'Distribution request ID is required.');
    }

    const reqRef = db.collection('interest_distribution_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Interest distribution request not found.');
    }

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending_approval') {
        throw new HttpsError('failed-precondition', `Cannot approve distribution request with status '${reqData.status}'. It must be reviewed and endorsed by both Senior Accountant and Compliance Reviewer first.`);
    }

    // SEGREGATION OF DUTIES (4-EYES / DUAL-CONTROL PRINCIPLE)
    if (reqData.initiatedBy === approverUid) {
        throw new HttpsError(
            'permission-denied', 
            'Segregation of Duties Violation: You initiated this distribution proposal. A different Super Administrator must review and approve it.'
        );
    }

    try {
        const batch = db.batch();
        const distRef = db.collection('interest_distributions').doc();
        const currentPeriod = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

        // Apply breakdown mutations
        const breakdown = reqData.breakdown || [];
        for (const item of breakdown) {
            const memberRef = db.collection('users').doc(item.memberId);
            if (item.payoutType === 'add_to_contribution') {
                const contribRef = db.collection('contributions').doc();
                batch.set(contribRef, {
                    memberId: item.memberId,
                    amount: item.distributedShare,
                    period: currentPeriod,
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    proofUrl: '',
                    status: 'verified',
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    verifiedBy: approverUid,
                    justification: `Interest profit capitalized into total savings (Distribution ${distRef.id})`,
                    type: 'interest_reinvestment'
                });
            } else {
                batch.update(memberRef, {
                    accruedInterest: admin.firestore.FieldValue.increment(item.distributedShare)
                });
            }
        }

        // Ledger Entry
        batch.set(distRef, {
            distributedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminId: approverUid,
            adminName: approverData?.name || approverData?.email || 'Admin',
            initiatedBy: reqData.initiatedBy,
            initiatedByName: reqData.initiatedByName,
            requestId: reqRef.id,
            amountDistributed: reqData.totalInterestToDistribute,
            totalPool: reqData.totalPool,
            totalRealizedInterest: reqData.totalRealizedInterest,
            previouslyDistributed: reqData.previouslyDistributed,
            availableBeforeDistribution: reqData.availableBeforeDistribution,
            availableAfterDistribution: (reqData.availableBeforeDistribution || 0) - (reqData.totalInterestToDistribute || 0),
            justification: reqData.justification,
            approvalNotes: approvalNotes ? String(approvalNotes).trim() : 'Approved and committed to official ledger',
            recipientsCount: reqData.recipientsCount,
            capitalizedCount: reqData.capitalizedCount,
            cashPayoutCount: reqData.cashPayoutCount,
            totalCapitalizedToContributions: reqData.totalCapitalizedToContributions,
            totalCashPayout: reqData.totalCashPayout,
            breakdown: reqData.breakdown
        });

        // Update Request Doc
        batch.update(reqRef, {
            status: 'approved',
            distributionId: distRef.id,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: approverUid,
            approvedByName: approverData?.name || approverData?.email || 'Admin',
            approvedByEmail: approverData?.email || request.auth.token.email || '',
            approvalNotes: approvalNotes ? String(approvalNotes).trim() : 'Approved and committed to ledger'
        });

        // Audit Log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: approverUid,
            action: 'ALLOCATE_INTEREST',
            justification: reqData.justification,
            details: {
                distributionId: distRef.id,
                requestId: reqRef.id,
                totalDistributed: reqData.totalInterestToDistribute,
                totalPool: reqData.totalPool,
                recipientsCount: reqData.recipientsCount,
                capitalizedCount: reqData.capitalizedCount,
                cashPayoutCount: reqData.cashPayoutCount,
                totalCapitalizedToContributions: reqData.totalCapitalizedToContributions,
                totalCashPayout: reqData.totalCashPayout,
                initiatedBy: reqData.initiatedBy,
                approvedBy: approverUid,
                approvalNotes: approvalNotes || ''
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Close payout campaign in settings if open
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            payoutCampaign: {
                status: 'closed',
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastDistributionId: distRef.id,
                lastDistributionAmount: reqData.totalInterestToDistribute
            }
        }, { merge: true });

        await batch.commit();

        return {
            success: true,
            distributionId: distRef.id,
            requestId: reqRef.id,
            amountDistributed: reqData.totalInterestToDistribute,
            recipientsCount: reqData.recipientsCount
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Rejects a pending interest distribution request.
 */
export const rejectInterestDistribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const callerUid = request.auth.uid;
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const callerData = callerSnap.data();

    if (callerData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only an administrator can reject interest distribution requests.');
    }

    const { requestId, rejectionReason } = request.data || {};
    if (!requestId) throw new HttpsError('invalid-argument', 'Request ID is required.');

    const reqRef = db.collection('interest_distribution_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) throw new HttpsError('not-found', 'Request not found.');

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending') {
        throw new HttpsError('failed-precondition', `Request has already been ${reqData.status}.`);
    }

    if (reqData.initiatedBy === callerUid) {
        throw new HttpsError('permission-denied', 'You cannot reject your own proposal. Another administrator must review.');
    }

    await reqRef.update({
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: callerUid,
        rejectedByName: callerData?.name || callerData?.email || 'Admin',
        rejectionReason: rejectionReason ? String(rejectionReason).trim() : 'Rejected during administrative audit review'
    });

    const logRef = db.collection('audit_logs').doc();
    await logRef.set({
        adminId: callerUid,
        action: 'REJECT_INTEREST_DISTRIBUTION',
        justification: rejectionReason || 'Proposal rejected during audit',
        details: { requestId, totalInterestToDistribute: reqData.totalInterestToDistribute },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Close payout campaign if linked to this rejected proposal
    const settingsRef = db.collection('settings').doc('financials');
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.data()?.payoutCampaign?.pendingRequestId === requestId) {
        await settingsRef.set({
            payoutCampaign: {
                status: 'closed',
                closedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        }, { merge: true });
    }

    return { success: true, requestId };
});

/**
 * Updates global financial settings like default interest rates and borrowing limits.
 */
export const updateFinancialSettings = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { 
        currency,
        loanInterestRate, 
        interestModel,
        interestType,
        contributionInterestRate, 
        maxLoanPercentage, 
        maxLendingPoolPercentage,
        minLoanAmount, 
        penaltyRate,
        depositBankName,
        depositAccountNumber,
        infrastructureBranding,
        appName,
        aboutUs,
        termsOfService,
        privacyPolicy,
        copyrightNotice,
        justification 
    } = request.data;

    try {
        const batch = db.batch();
        const settingsRef = db.collection('settings').doc('financials');
        
        batch.set(settingsRef, {
            currency: currency || 'RWF',
            loanInterestRate: Number(loanInterestRate),
            interestModel: interestModel || 'one-off',
            interestType: interestType || 'immediate',
            contributionInterestRate: Number(contributionInterestRate),
            maxLoanPercentage: Number(maxLoanPercentage),
            maxLendingPoolPercentage: maxLendingPoolPercentage !== undefined ? Number(maxLendingPoolPercentage) : 90,
            minLoanAmount: Number(minLoanAmount),
            penaltyRate: Number(penaltyRate || 2),
            depositBankName: depositBankName ? String(depositBankName).trim() : '',
            depositAccountNumber: depositAccountNumber ? String(depositAccountNumber).trim() : '',
            infrastructureBranding: infrastructureBranding !== undefined ? String(infrastructureBranding).trim() : 'Secure Infrastructure Provided by ORVEXI',
            appName: appName !== undefined ? String(appName).trim() : 'Ikimina App',
            aboutUs: aboutUs !== undefined ? String(aboutUs).trim() : '',
            termsOfService: termsOfService !== undefined ? String(termsOfService).trim() : '',
            privacyPolicy: privacyPolicy !== undefined ? String(privacyPolicy).trim() : '',
            copyrightNotice: copyrightNotice !== undefined ? String(copyrightNotice).trim() : '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid
        }, { merge: true });

        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'UPDATE_FINANCIAL_SETTINGS',
            justification,
            details: { 
                currency, 
                loanInterestRate, 
                interestModel,
                interestType,
                depositBankName,
                depositAccountNumber,
                contributionInterestRate, 
                maxLoanPercentage, 
                maxLendingPoolPercentage: maxLendingPoolPercentage !== undefined ? Number(maxLendingPoolPercentage) : 90,
                minLoanAmount, 
                penaltyRate,
                infrastructureBranding,
                appName,
                hasCustomAbout: !!aboutUs,
                hasCustomTerms: !!termsOfService,
                hasCustomPrivacy: !!privacyPolicy
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
 * Super Admin Action: Resets all financial metrics to zero.
 * Wipes contributions, loans, repayments, and interest distributions.
 * Resets all member accruedInterest balances to 0.
 * Preserves user accounts, credentials, profiles, and platform configuration.
 */
export const resetFinancialData = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    const isSuperAdmin = adminData?.isSuperAdmin === true || 
      request.auth.token.email === 'tharushyamagara@gmail.com' ||
      adminData?.email === 'tharushyamagara@gmail.com';

    if (!isSuperAdmin) {
        throw new HttpsError('permission-denied', 'Only a verified Super Administrator can reset all financial data.');
    }

    const { justification } = request.data || {};
    if (!justification || typeof justification !== 'string' || justification.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'An audit justification is strictly required to reset financial data.');
    }

    try {
        const contribsSnap = await db.collection('contributions').get();
        const loansSnap = await db.collection('loans').get();
        const repaymentsSnap = await db.collection('repayments').get();
        const distributionsSnap = await db.collection('interest_distributions').get();
        const expensesSnap = await db.collection('expenses').get();
        const batchesSnap = await db.collection('contribution_batches').get();
        const interestRequestsSnap = await db.collection('interest_distribution_requests').get();
        const auditSnap = await db.collection('audit_logs').where('action', 'in', ['ALLOCATE_INTEREST', 'LODGE_EXPENSE', 'APPROVE_EXPENSE', 'REJECT_EXPENSE']).get();
        const usersSnap = await db.collection('users').get();

        let batch = db.batch();
        let opCount = 0;

        const commitBatchIfNeeded = async () => {
            if (opCount >= 400) {
                await batch.commit();
                batch = db.batch();
                opCount = 0;
            }
        };

        for (const doc of contribsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of loansSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of repaymentsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of distributionsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of expensesSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of batchesSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of interestRequestsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of auditSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }

        for (const doc of usersSnap.docs) {
            batch.update(doc.ref, { 
                accruedInterest: 0,
                totalContributed: 0
            });
            opCount++;
            await commitBatchIfNeeded();
        }

        // Record permanent audit log of the financial reset
        const resetAuditRef = db.collection('audit_logs').doc();
        batch.set(resetAuditRef, {
            adminId: request.auth.uid,
            adminEmail: request.auth.token.email || adminData?.email || 'tharushyamagara@gmail.com',
            action: 'RESET_FINANCIAL_DATA',
            justification,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: {
                contributionsDeleted: contribsSnap.size,
                loansDeleted: loansSnap.size,
                repaymentsDeleted: repaymentsSnap.size,
                distributionsDeleted: distributionsSnap.size,
                expensesDeleted: expensesSnap.size,
                batchesDeleted: batchesSnap.size,
                interestRequestsDeleted: interestRequestsSnap.size,
                usersReset: usersSnap.size
            }
        });
        opCount++;

        if (opCount > 0) {
            await batch.commit();
        }

        return { 
            success: true, 
            summary: {
                contributionsDeleted: contribsSnap.size,
                loansDeleted: loansSnap.size,
                repaymentsDeleted: repaymentsSnap.size,
                distributionsDeleted: distributionsSnap.size,
                expensesDeleted: expensesSnap.size,
                batchesDeleted: batchesSnap.size,
                interestRequestsDeleted: interestRequestsSnap.size,
                usersReset: usersSnap.size
            }
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Returns the current system-wide financial policy settings.
 * Any authenticated user can call this — it is a read-only operation.
 * This is the ONLY authorised way for the client to read settings;
 * pages must not directly query settings/financials via Firestore.
 */
export const getSystemSettings = onCall({ cors: true }, async (request) => {
    const db = admin.firestore();
    const snap = await db.collection('settings').doc('financials').get();

    if (!snap.exists) {
        // Return safe defaults if the document hasn't been created yet
        return {
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
            payoutCampaign: { status: 'closed' }
        };
    }

    const data = snap.data()!;
    return {
        currency: data.currency || 'RWF',
        loanInterestRate: Number(data.loanInterestRate) || 10,
        interestModel: data.interestModel || 'one-off',
        interestType: data.interestType || 'immediate',
        contributionInterestRate: Number(data.contributionInterestRate) || 50000,
        maxLoanPercentage: Number(data.maxLoanPercentage) || 200,
        maxLendingPoolPercentage: data.maxLendingPoolPercentage !== undefined ? Number(data.maxLendingPoolPercentage) : 90,
        minLoanAmount: Number(data.minLoanAmount) || 5000,
        penaltyRate: Number(data.penaltyRate) || 2,
        depositBankName: data.depositBankName || '',
        depositAccountNumber: data.depositAccountNumber || '',
        infrastructureBranding: data.infrastructureBranding || 'Secure Infrastructure Provided by ORVEXI',
        appName: data.appName || 'Ikimina App',
        aboutUs: data.aboutUs || '',
        termsOfService: data.termsOfService || '',
        privacyPolicy: data.privacyPolicy || '',
        copyrightNotice: data.copyrightNotice || '',
        payoutCampaign: data.payoutCampaign || { status: 'closed' }
    };
});

/**
 * Admin Action: Opens an active member interest payout election campaign.
 * Broadcasts in-app for all members to elect whether to add profit to contributions or receive cash.
 */
/**
 * Step 1: Accountant / Senior Accountant initiates a request for members' preferences
 * (Interest Payout / Capitalization Campaign).
 */
export const initiateInterestPayoutCampaign = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'accountant' && callerRole !== 'senior_accountant') {
        throw new HttpsError('permission-denied', 'Only accountants or senior accountants can initiate preference campaigns. Administrators and reviewers cannot initiate.');
    }

    const { targetAmount, announcement, justification } = request.data || {};
    const campaignRef = db.collection('campaign_requests').doc();

    const campaignData = {
        id: campaignRef.id,
        targetAmount: targetAmount ? Number(targetAmount) : null,
        announcement: announcement ? String(announcement).trim() : 'Annual / Periodic Profit Distribution is being prepared. Please elect your payout preference.',
        justification: justification ? String(justification).trim() : 'Initiated member preference election window',
        status: 'pending_review',
        initiatedBy: request.auth.uid,
        initiatedByName: callerSnap.data()?.name || 'Accountant',
        initiatedByEmail: callerSnap.data()?.email || '',
        initiatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await campaignRef.set(campaignData);

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'INITIATE_INTEREST_PAYOUT_CAMPAIGN',
        justification: campaignData.justification,
        details: { campaignId: campaignRef.id, targetAmount, announcement },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, campaignId: campaignRef.id, status: 'pending_review' };
});

/**
 * Step 2: Reviewer / Senior Accountant reviews and endorses the payout preference campaign request.
 */
export const reviewInterestPayoutCampaign = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'senior_accountant' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers or senior accountants can review preference campaigns. Administrators cannot review.');
    }

    const { campaignId, decision, reviewNotes } = request.data || {};
    if (!campaignId) throw new HttpsError('invalid-argument', 'Campaign ID is required.');
    if (!['endorse', 'request_changes', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Decision must be endorse, request_changes, or reject.');
    }

    const campaignRef = db.collection('campaign_requests').doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) throw new HttpsError('not-found', 'Campaign request not found.');

    const campaignData = campaignSnap.data()!;
    if (campaignData.initiatedBy === request.auth.uid) {
        throw new HttpsError('failed-precondition', 'Dual-control violation: You cannot review a preference campaign you initiated.');
    }
    if (campaignData.status !== 'pending_review') {
        throw new HttpsError('failed-precondition', `Cannot review campaign in status '${campaignData.status}'. Must be pending_review.`);
    }

    let nextStatus = 'pending_approval';
    if (decision === 'request_changes') nextStatus = 'revision_requested';
    if (decision === 'reject') nextStatus = 'rejected';

    await campaignRef.update({
        status: nextStatus,
        reviewedBy: request.auth.uid,
        reviewedByName: callerSnap.data()?.name || 'Reviewer',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewNotes: reviewNotes || ''
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_INTEREST_PAYOUT_CAMPAIGN',
        justification: `Reviewed campaign with decision: ${decision}`,
        details: { campaignId, decision, reviewNotes },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, campaignId, status: nextStatus, message: `Campaign ${nextStatus}` };
});

/**
 * Step 3: Administrator / Management approves and opens the payout preference election campaign.
 */
export const approveInterestPayoutCampaign = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminRole = adminSnap.data()?.role;

    if (adminRole !== 'admin' && adminRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only administrators or executive management can approve preference campaigns.');
    }

    const { campaignId, decision = 'approve', approvalNotes } = request.data || {};
    if (!campaignId) throw new HttpsError('invalid-argument', 'Campaign ID is required.');

    const campaignRef = db.collection('campaign_requests').doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) throw new HttpsError('not-found', 'Campaign request not found.');

    const campaignData = campaignSnap.data()!;
    if (campaignData.initiatedBy === request.auth.uid) {
        throw new HttpsError('failed-precondition', 'Dual-control violation: You cannot approve a campaign request you initiated.');
    }
    if (campaignData.reviewedBy === request.auth.uid) {
        throw new HttpsError('failed-precondition', 'Dual-control violation: You cannot approve a campaign request you personally reviewed.');
    }
    if (campaignData.status !== 'pending_approval') {
        throw new HttpsError('failed-precondition', `Cannot approve campaign in status '${campaignData.status}'. Must be pending_approval.`);
    }

    if (decision === 'reject') {
        await campaignRef.update({
            status: 'rejected',
            rejectedBy: request.auth.uid,
            rejectedByName: adminSnap.data()?.name || 'Admin',
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvalNotes: approvalNotes || ''
        });
        return { success: true, campaignId, status: 'rejected' };
    }

    // Activate campaign in settings/financials
    const settingsRef = db.collection('settings').doc('financials');
    await settingsRef.set({
        payoutCampaign: {
            status: 'open',
            targetAmount: campaignData.targetAmount,
            announcement: campaignData.announcement,
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            openedBy: campaignData.initiatedBy,
            approvedBy: request.auth.uid,
            campaignRequestId: campaignId
        }
    }, { merge: true });

    await campaignRef.update({
        status: 'open',
        approvedBy: request.auth.uid,
        approvedByName: adminSnap.data()?.name || 'Admin',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvalNotes: approvalNotes || ''
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'APPROVE_INTEREST_PAYOUT_CAMPAIGN',
        justification: approvalNotes || 'Approved member payout preference election campaign',
        details: { campaignId, targetAmount: campaignData.targetAmount },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, campaignId, status: 'open' };
});

export const openInterestPayoutCampaign = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin' && adminSnap.data()?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { targetAmount, announcement } = request.data || {};
    const settingsRef = db.collection('settings').doc('financials');
    
    await settingsRef.set({
        payoutCampaign: {
            status: 'open',
            targetAmount: targetAmount ? Number(targetAmount) : null,
            announcement: announcement ? String(announcement).trim() : 'Annual / Periodic Profit Distribution is being prepared. Please elect your payout preference.',
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            openedBy: request.auth.uid
        }
    }, { merge: true });

    const logRef = db.collection('audit_logs').doc();
    await logRef.set({
        adminId: request.auth.uid,
        action: 'OPEN_INTEREST_PAYOUT_CAMPAIGN',
        justification: 'Opened member payout preference election window',
        details: { targetAmount, announcement },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});

/**
 * Admin Action: Closes an active interest payout campaign without executing distribution.
 */
export const closeInterestPayoutCampaign = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const settingsRef = db.collection('settings').doc('financials');
    await settingsRef.set({
        payoutCampaign: {
            status: 'closed',
            closedAt: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });

    return { success: true };
});

/**
 * Member / Admin Action: Records a member's interest payout preference.
 * - 'add_to_contribution': Interest is capitalized directly into total verified savings.
 * - 'receive_payout': Interest is paid out as liquid accrued profit.
 */
export const setMemberPayoutPreference = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    const { preference, memberId } = request.data || {};
    
    if (preference !== 'add_to_contribution' && preference !== 'receive_payout') {
        throw new HttpsError('invalid-argument', 'Preference must be either "add_to_contribution" or "receive_payout".');
    }

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    
    // An admin can record the preference on behalf of any member; otherwise users can only update their own
    const targetUserId = (callerData?.role === 'admin' && memberId) ? memberId : request.auth.uid;

    await db.collection('users').doc(targetUserId).update({
        interestPayoutPreference: preference,
        interestPayoutPreferenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, preference, targetUserId };
});

