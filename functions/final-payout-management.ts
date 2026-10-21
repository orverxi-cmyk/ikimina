import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * FINAL PAYOUT (MEMBER EXIT) WORKFLOW
 *
 * 1. An Accountant (or Admin / Management) initiates a final payout for a member,
 *    attaching a mandatory supporting document (signed exit form, bank transfer slip, etc.).
 * 2. A Super Administrator (role 'admin') — who must be a different person from the
 *    initiator — reviews and approves the payout.
 * 3. Approval settles the member's ledger (verified contributions are marked 'paid_out'
 *    so they leave the group's asset totals while remaining in history) and then
 *    permanently deletes the member's profile and Firebase Auth account.
 *
 * A member holding a positive contribution balance can never be deleted directly;
 * this workflow is the only path to remove them.
 */

const INITIATOR_ROLES = ['accountant', 'senior_accountant', 'admin', 'management'];
const BATCH_LIMIT = 450;

export type MemberFinancialPosition = {
    contributionTotal: number;
    verifiedContributionCount: number;
    pendingContributionCount: number;
    accruedInterest: number;
    outstandingLoanBalance: number;
    totalPayout: number;
};

/**
 * Computes a member's authoritative financial position from the ledgers.
 */
export async function getMemberFinancialPosition(
    db: admin.firestore.Firestore,
    memberId: string,
    userData?: admin.firestore.DocumentData
): Promise<MemberFinancialPosition> {
    const contribsSnap = await db.collection('contributions').where('memberId', '==', memberId).get();

    let contributionTotal = 0;
    let verifiedContributionCount = 0;
    let pendingContributionCount = 0;
    contribsSnap.forEach(d => {
        const c = d.data();
        if (c.status === 'verified') {
            contributionTotal += Number(c.amount) || 0;
            verifiedContributionCount++;
        } else if (c.status === 'pending') {
            pendingContributionCount++;
        }
    });

    const loansSnap = await db.collection('loans')
        .where('memberId', '==', memberId)
        .where('status', '==', 'approved')
        .get();
    let outstandingLoanBalance = 0;
    loansSnap.forEach(d => {
        const bal = Number(d.data().balance) || 0;
        if (bal > 0) outstandingLoanBalance += bal;
    });

    let data = userData;
    if (!data) {
        const userSnap = await db.collection('users').doc(memberId).get();
        data = userSnap.exists ? userSnap.data() : {};
    }
    const accruedInterest = Number(data?.accruedInterest) || 0;

    return {
        contributionTotal,
        verifiedContributionCount,
        pendingContributionCount,
        accruedInterest,
        outstandingLoanBalance,
        totalPayout: contributionTotal + accruedInterest,
    };
}

/**
 * Throws if a member still holds funds in the group and therefore must go
 * through the Final Payout workflow instead of being deleted directly.
 */
export async function assertMemberHasNoBalance(db: admin.firestore.Firestore, memberId: string) {
    const pos = await getMemberFinancialPosition(db, memberId);
    if (pos.contributionTotal > 0 || pos.accruedInterest > 0) {
        throw new HttpsError(
            'failed-precondition',
            `This member still holds ${pos.contributionTotal} in contributions` +
            (pos.accruedInterest > 0 ? ` and ${pos.accruedInterest} in accrued interest` : '') +
            '. Members with a positive balance cannot be deleted. An Accountant must initiate a Final Payout, which deletes the account once approved by an Administrator.'
        );
    }
    return pos;
}

/**
 * Step 1: Accountant initiates a final payout with a mandatory supporting document.
 */
export const initiateFinalPayout = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();

    if (!INITIATOR_ROLES.includes(caller?.role)) {
        throw new HttpsError('permission-denied', 'Only the Accountant or Administrators can initiate a final payout.');
    }

    const { memberId, documentUrl, documentFileName, notes, payoutMethod, payoutReference } = request.data || {};

    if (!memberId || typeof memberId !== 'string') {
        throw new HttpsError('invalid-argument', 'Member ID is required.');
    }
    if (memberId === callerId) {
        throw new HttpsError('failed-precondition', 'You cannot initiate a final payout for your own account.');
    }
    if (!documentUrl || typeof documentUrl !== 'string' || !documentUrl.trim()) {
        throw new HttpsError('invalid-argument', 'A supporting document is mandatory to initiate a final payout.');
    }
    if (!notes || typeof notes !== 'string' || !notes.trim()) {
        throw new HttpsError('invalid-argument', 'A justification for the final payout is required.');
    }

    const memberRef = db.collection('users').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
        throw new HttpsError('not-found', 'Member record not found.');
    }
    const member = memberSnap.data()!;

    const existing = await db.collection('final_payouts')
        .where('memberId', '==', memberId)
        .where('status', 'in', ['pending', 'processing', 'pending_review', 'pending_reviewer', 'pending_approval'])
        .limit(1)
        .get();
    if (!existing.empty) {
        throw new HttpsError('already-exists', 'A final payout for this member is already awaiting approval.');
    }

    const pos = await getMemberFinancialPosition(db, memberId, member);

    if (pos.outstandingLoanBalance > 0) {
        throw new HttpsError(
            'failed-precondition',
            `This member has an outstanding loan balance of ${pos.outstandingLoanBalance}. All loans must be settled before a final payout.`
        );
    }
    if (pos.totalPayout <= 0) {
        throw new HttpsError(
            'failed-precondition',
            'This member has no contribution balance to pay out. Their account can be deleted directly from the Members Directory.'
        );
    }

    const payoutRef = db.collection('final_payouts').doc();
    const initiatorName = caller?.name || caller?.email || 'Accountant';

    const batch = db.batch();
    batch.set(payoutRef, {
        memberId,
        memberName: member.name || 'Member',
        memberEmail: member.email || '',
        memberPhone: member.phone || '',
        memberRole: member.role || 'member',
        contributionTotal: pos.contributionTotal,
        verifiedContributionCount: pos.verifiedContributionCount,
        accruedInterest: pos.accruedInterest,
        totalPayout: pos.totalPayout,
        documentUrl: documentUrl.trim(),
        documentFileName: (typeof documentFileName === 'string' && documentFileName.trim()) ? documentFileName.trim() : 'supporting_document',
        notes: notes.trim(),
        payoutMethod: typeof payoutMethod === 'string' ? payoutMethod.trim() : '',
        payoutReference: typeof payoutReference === 'string' ? payoutReference.trim() : '',
        status: 'pending_review',
        initiatedByRole: caller?.role || 'accountant',
        initiatedBy: callerId,
        initiatedByName: initiatorName,
        initiatedByEmail: caller?.email || '',
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(memberRef, {
        finalPayoutPending: true,
        finalPayoutId: payoutRef.id,
    });

    batch.set(db.collection('audit_logs').doc(), {
        adminId: callerId,
        action: 'INITIATE_FINAL_PAYOUT',
        justification: notes.trim(),
        performedBy: callerId,
        performedByName: initiatorName,
        details: {
            payoutId: payoutRef.id,
            memberId,
            memberName: member.name || '',
            memberEmail: member.email || '',
            contributionTotal: pos.contributionTotal,
            accruedInterest: pos.accruedInterest,
            totalPayout: pos.totalPayout,
            documentUrl: documentUrl.trim(),
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
        success: true,
        payoutId: payoutRef.id,
        totalPayout: pos.totalPayout,
        contributionTotal: pos.contributionTotal,
        accruedInterest: pos.accruedInterest,
    };
});

/**
 * Step 2: Senior Accountant or Reviewer reviews/endorses the final payout.
 * - Senior Accountant endorses: advances status from 'pending_review' to 'pending_reviewer'.
 * - Reviewer endorses: advances status from 'pending_reviewer' to 'pending_approval'.
 */
export const reviewFinalPayout = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();
    const callerRole = caller?.role;

    const allowedRoles = ['senior_accountant', 'reviewer', 'management', 'admin'];
    if (!allowedRoles.includes(callerRole)) {
        throw new HttpsError('permission-denied', 'Only Senior Accountants or Reviewers can review final payouts.');
    }

    const { payoutId, decision, reviewNotes } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new HttpsError('invalid-argument', 'Payout ID is required.');
    }
    if (!decision || !['endorse', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid review decision (endorse or reject) is required.');
    }

    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) throw new HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data()!;

    const isSeniorAcct = callerRole === 'senior_accountant';

    if (isSeniorAcct) {
        if (payout.status !== 'pending_review' && payout.status !== 'pending') {
            throw new HttpsError('failed-precondition', `Cannot endorse final payout with status '${payout.status}'. It must be pending senior review.`);
        }
    } else {
        // Reviewer / Management / Admin acting as Reviewer
        if (payout.status !== 'pending_reviewer') {
            throw new HttpsError('failed-precondition', `Reviewer can only review final payouts that have been endorsed by the Senior Accountant. Current status: '${payout.status}'.`);
        }
        if (payout.initiatedBy === callerId) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review a payout you initiated.');
        }
    }

    const reviewerName = caller?.name || caller?.email || (isSeniorAcct ? 'Senior Accountant' : 'Reviewer');

    if (decision === 'reject') {
        const batch = db.batch();
        batch.update(payoutRef, {
            status: 'rejected',
            rejectedBy: callerId,
            rejectedByName: reviewerName,
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectionReason: (reviewNotes && typeof reviewNotes === 'string' && reviewNotes.trim()) ? reviewNotes.trim() : 'Rejected during review',
        });
        const memberRef = db.collection('users').doc(payout.memberId);
        const memberSnap = await memberRef.get();
        if (memberSnap.exists) {
            batch.update(memberRef, {
                finalPayoutPending: false,
                finalPayoutId: admin.firestore.FieldValue.delete(),
            });
        }
        batch.set(db.collection('audit_logs').doc(), {
            adminId: callerId,
            action: isSeniorAcct ? 'SENIOR_ACCOUNTANT_REJECT_FINAL_PAYOUT' : 'REVIEWER_REJECT_FINAL_PAYOUT',
            justification: reviewNotes || 'Rejected during review',
            performedBy: callerId,
            performedByName: reviewerName,
            details: { payoutId, memberId: payout.memberId, memberName: payout.memberName, totalPayout: payout.totalPayout },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
        return { success: true, payoutId, status: 'rejected' };
    }

    const nextStatus = isSeniorAcct ? 'pending_reviewer' : 'pending_approval';
    const updatePayload: any = {
        status: nextStatus,
    };
    if (isSeniorAcct) {
        updatePayload.seniorReviewed = true;
        updatePayload.seniorReviewedBy = callerId;
        updatePayload.seniorReviewedByName = reviewerName;
        updatePayload.seniorReviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.seniorReviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    } else {
        updatePayload.complianceReviewed = true;
        updatePayload.reviewedBy = callerId;
        updatePayload.reviewedByName = reviewerName;
        updatePayload.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.reviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    }

    await payoutRef.update(updatePayload);

    await db.collection('audit_logs').add({
        action: isSeniorAcct ? 'SENIOR_ACCOUNTANT_ENDORSE_FINAL_PAYOUT' : 'REVIEWER_ENDORSE_FINAL_PAYOUT',
        performedBy: callerId,
        performedByName: reviewerName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { payoutId, memberId: payout.memberId, memberName: payout.memberName, nextStatus, reviewNotes: reviewNotes || null },
    });

    return { success: true, payoutId, status: nextStatus };
});

/**
 * Step 3: Super Administrator approves the final payout.
 * Settles the member's ledger and PERMANENTLY deletes the member account.
 */
export const approveFinalPayout = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();

    if (caller?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only Super Administrators can approve a final payout.');
    }

    const { payoutId, adminNotes } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new HttpsError('invalid-argument', 'Payout ID is required.');
    }

    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) throw new HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data()!;

    if (payout.status !== 'pending_approval') {
        throw new HttpsError('failed-precondition', `This final payout cannot be approved. It must be reviewed and endorsed by the Reviewer first (current status: '${payout.status}').`);
    }
    if (payout.initiatedBy === callerId) {
        throw new HttpsError('permission-denied', 'Segregation of duties violation: you cannot approve a final payout you initiated.');
    }

    const memberId: string = payout.memberId;
    if (memberId === callerId) {
        throw new HttpsError('failed-precondition', 'You cannot approve a final payout for your own account.');
    }

    // Re-verify the ledger: the balance must not have changed since initiation.
    const pos = await getMemberFinancialPosition(db, memberId);
    if (pos.outstandingLoanBalance > 0) {
        throw new HttpsError('failed-precondition', `Member now has an outstanding loan balance of ${pos.outstandingLoanBalance}. Reject this payout and settle the loan first.`);
    }
    if (Math.abs(pos.totalPayout - (Number(payout.totalPayout) || 0)) > 0.0001) {
        throw new HttpsError(
            'failed-precondition',
            `The member's balance changed since this payout was initiated (was ${payout.totalPayout}, now ${pos.totalPayout}). Reject it and ask the Accountant to re-initiate.`
        );
    }

    // Lock the request to prevent double approval.
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(payoutRef);
        if (fresh.data()?.status !== 'pending_approval') {
            throw new HttpsError('failed-precondition', 'This final payout is no longer awaiting admin approval.');
        }
        tx.update(payoutRef, { status: 'processing', processingStartedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    const approverName = caller?.name || caller?.email || 'Super Admin';

    try {
        // 1. Settle contributions: verified -> paid_out, pending -> rejected
        const contribsSnap = await db.collection('contributions').where('memberId', '==', memberId).get();
        const contribDocs = contribsSnap.docs.filter(d => ['verified', 'pending'].includes(d.data().status));

        for (let i = 0; i < contribDocs.length; i += BATCH_LIMIT) {
            const batch = db.batch();
            contribDocs.slice(i, i + BATCH_LIMIT).forEach(d => {
                if (d.data().status === 'verified') {
                    batch.update(d.ref, {
                        status: 'paid_out',
                        finalPayoutId: payoutId,
                        paidOutAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                } else {
                    batch.update(d.ref, {
                        status: 'rejected',
                        rejectionReason: 'Member exited the group via final payout.',
                        finalPayoutId: payoutId,
                        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            });
            await batch.commit();
        }

        // 2. Finalize: mark payout approved, resolve deletion requests, delete user, audit
        const finalBatch = db.batch();

        finalBatch.update(payoutRef, {
            status: 'approved',
            approvedBy: callerId,
            approvedByName: approverName,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminNotes: (typeof adminNotes === 'string' && adminNotes.trim()) ? adminNotes.trim() : null,
            memberDeleted: true,
            settledContributionCount: contribDocs.length,
        });

        const pendingReqs = await db.collection('account_deletion_requests')
            .where('userId', '==', memberId)
            .where('status', '==', 'pending')
            .get();
        pendingReqs.forEach(r => finalBatch.update(r.ref, {
            status: 'approved',
            reviewedBy: callerId,
            reviewedByName: approverName,
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminNotes: `Resolved via final payout ${payoutId}`,
        }));

        finalBatch.delete(db.collection('users').doc(memberId));

        finalBatch.set(db.collection('audit_logs').doc(), {
            adminId: callerId,
            action: 'APPROVE_FINAL_PAYOUT_AND_DELETE_MEMBER',
            justification: (typeof adminNotes === 'string' && adminNotes.trim()) || payout.notes || 'Final payout approved',
            performedBy: callerId,
            performedByName: approverName,
            details: {
                payoutId,
                memberId,
                memberName: payout.memberName,
                memberEmail: payout.memberEmail,
                contributionTotal: payout.contributionTotal,
                accruedInterest: payout.accruedInterest,
                totalPayout: payout.totalPayout,
                initiatedBy: payout.initiatedBy,
                initiatedByName: payout.initiatedByName,
                documentUrl: payout.documentUrl,
                impact: `Paid out ${payout.totalPayout} and permanently deleted member account`,
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        await finalBatch.commit();
    } catch (error: any) {
        // Release the lock so the payout can be retried or rejected.
        await payoutRef.update({ status: 'pending_approval', lastError: error?.message || String(error) }).catch(() => undefined);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error?.message || 'Failed to process final payout.');
    }

    // 3. Remove Firebase Auth credentials
    try {
        await admin.auth().deleteUser(memberId);
    } catch (e: any) {
        console.warn('Auth user already deleted or not found:', e?.message || e);
    }

    return { success: true, payoutId, memberId, totalPayout: payout.totalPayout };
});

/**
 * Super Administrator rejects a final payout. The member account is untouched.
 */
export const rejectFinalPayout = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();

    const allowedRejectRoles = ['admin', 'management', 'reviewer', 'senior_accountant'];
    if (!allowedRejectRoles.includes(caller?.role)) {
        throw new HttpsError('permission-denied', 'Only Senior Accountants, Reviewers, or Administrators can reject a final payout.');
    }

    const { payoutId, rejectionReason } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new HttpsError('invalid-argument', 'Payout ID is required.');
    }
    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
        throw new HttpsError('invalid-argument', 'A rejection reason is required.');
    }

    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) throw new HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data()!;

    const rejectableStatuses = ['pending', 'pending_review', 'pending_reviewer', 'pending_approval'];
    if (!rejectableStatuses.includes(payout.status)) {
        throw new HttpsError('failed-precondition', `This final payout cannot be rejected because its status is '${payout.status}'.`);
    }

    const rejecterName = caller?.name || caller?.email || 'Officer';
    const batch = db.batch();

    batch.update(payoutRef, {
        status: 'rejected',
        rejectedBy: callerId,
        rejectedByName: rejecterName,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: rejectionReason.trim(),
    });

    const memberRef = db.collection('users').doc(payout.memberId);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
        batch.update(memberRef, {
            finalPayoutPending: false,
            finalPayoutId: admin.firestore.FieldValue.delete(),
        });
    }

    batch.set(db.collection('audit_logs').doc(), {
        adminId: callerId,
        action: 'REJECT_FINAL_PAYOUT',
        justification: rejectionReason.trim(),
        performedBy: callerId,
        performedByName: rejecterName,
        details: {
            payoutId,
            memberId: payout.memberId,
            memberName: payout.memberName,
            totalPayout: payout.totalPayout,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { success: true, payoutId };
});

/**
 * Initiator (Accountant or Senior Accountant) withdraws their pending payout before final approval.
 */
export const withdrawFinalPayout = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();

    const { payoutId, reason } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new HttpsError('invalid-argument', 'Payout ID is required.');
    }

    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) throw new HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data()!;

    if (payout.initiatedBy !== callerId && caller?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only the initiator can withdraw this final payout.');
    }

    const withdrawableStatuses = ['pending', 'pending_review', 'pending_reviewer', 'pending_approval'];
    if (!withdrawableStatuses.includes(payout.status)) {
        throw new HttpsError('failed-precondition', `Cannot withdraw final payout with status '${payout.status}'. Only pending payouts can be withdrawn.`);
    }

    const withdrawerName = caller?.name || caller?.email || 'Initiator';
    const withdrawalReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Withdrawn by initiator';

    const batch = db.batch();
    batch.update(payoutRef, {
        status: 'withdrawn',
        withdrawnBy: callerId,
        withdrawnByName: withdrawerName,
        withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
        withdrawalReason,
    });

    const memberRef = db.collection('users').doc(payout.memberId);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
        batch.update(memberRef, {
            finalPayoutPending: false,
            finalPayoutId: admin.firestore.FieldValue.delete(),
        });
    }

    batch.set(db.collection('audit_logs').doc(), {
        adminId: callerId,
        action: 'WITHDRAW_FINAL_PAYOUT',
        justification: withdrawalReason,
        performedBy: callerId,
        performedByName: withdrawerName,
        details: {
            payoutId,
            memberId: payout.memberId,
            memberName: payout.memberName,
            totalPayout: payout.totalPayout,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { success: true, payoutId, status: 'withdrawn' };
});
