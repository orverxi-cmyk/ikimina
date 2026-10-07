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
exports.rejectFinalPayout = exports.approveFinalPayout = exports.initiateFinalPayout = void 0;
exports.getMemberFinancialPosition = getMemberFinancialPosition;
exports.assertMemberHasNoBalance = assertMemberHasNoBalance;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
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
/**
 * Computes a member's authoritative financial position from the ledgers.
 */
async function getMemberFinancialPosition(db, memberId, userData) {
    const contribsSnap = await db.collection('contributions').where('memberId', '==', memberId).get();
    let contributionTotal = 0;
    let verifiedContributionCount = 0;
    let pendingContributionCount = 0;
    contribsSnap.forEach(d => {
        const c = d.data();
        if (c.status === 'verified') {
            contributionTotal += Number(c.amount) || 0;
            verifiedContributionCount++;
        }
        else if (c.status === 'pending') {
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
        if (bal > 0)
            outstandingLoanBalance += bal;
    });
    let data = userData;
    if (!data) {
        const userSnap = await db.collection('users').doc(memberId).get();
        data = userSnap.exists ? userSnap.data() : {};
    }
    const accruedInterest = Number(data === null || data === void 0 ? void 0 : data.accruedInterest) || 0;
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
async function assertMemberHasNoBalance(db, memberId) {
    const pos = await getMemberFinancialPosition(db, memberId);
    if (pos.contributionTotal > 0 || pos.accruedInterest > 0) {
        throw new https_1.HttpsError('failed-precondition', `This member still holds ${pos.contributionTotal} in contributions` +
            (pos.accruedInterest > 0 ? ` and ${pos.accruedInterest} in accrued interest` : '') +
            '. Members with a positive balance cannot be deleted. An Accountant must initiate a Final Payout, which deletes the account once approved by an Administrator.');
    }
    return pos;
}
/**
 * Step 1: Accountant initiates a final payout with a mandatory supporting document.
 */
exports.initiateFinalPayout = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();
    if (!INITIATOR_ROLES.includes(caller === null || caller === void 0 ? void 0 : caller.role)) {
        throw new https_1.HttpsError('permission-denied', 'Only the Accountant or Administrators can initiate a final payout.');
    }
    const { memberId, documentUrl, documentFileName, notes, payoutMethod, payoutReference } = request.data || {};
    if (!memberId || typeof memberId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Member ID is required.');
    }
    if (memberId === callerId) {
        throw new https_1.HttpsError('failed-precondition', 'You cannot initiate a final payout for your own account.');
    }
    if (!documentUrl || typeof documentUrl !== 'string' || !documentUrl.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'A supporting document is mandatory to initiate a final payout.');
    }
    if (!notes || typeof notes !== 'string' || !notes.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'A justification for the final payout is required.');
    }
    const memberRef = db.collection('users').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Member record not found.');
    }
    const member = memberSnap.data();
    const existing = await db.collection('final_payouts')
        .where('memberId', '==', memberId)
        .where('status', 'in', ['pending', 'processing'])
        .limit(1)
        .get();
    if (!existing.empty) {
        throw new https_1.HttpsError('already-exists', 'A final payout for this member is already awaiting approval.');
    }
    const pos = await getMemberFinancialPosition(db, memberId, member);
    if (pos.outstandingLoanBalance > 0) {
        throw new https_1.HttpsError('failed-precondition', `This member has an outstanding loan balance of ${pos.outstandingLoanBalance}. All loans must be settled before a final payout.`);
    }
    if (pos.totalPayout <= 0) {
        throw new https_1.HttpsError('failed-precondition', 'This member has no contribution balance to pay out. Their account can be deleted directly from the Members Directory.');
    }
    const payoutRef = db.collection('final_payouts').doc();
    const initiatorName = (caller === null || caller === void 0 ? void 0 : caller.name) || (caller === null || caller === void 0 ? void 0 : caller.email) || 'Accountant';
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
        status: 'pending',
        initiatedBy: callerId,
        initiatedByName: initiatorName,
        initiatedByEmail: (caller === null || caller === void 0 ? void 0 : caller.email) || '',
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
 * Step 2: Super Administrator approves the final payout.
 * Settles the member's ledger and PERMANENTLY deletes the member account.
 */
exports.approveFinalPayout = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();
    if ((caller === null || caller === void 0 ? void 0 : caller.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only Super Administrators can approve a final payout.');
    }
    const { payoutId, adminNotes } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Payout ID is required.');
    }
    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists)
        throw new https_1.HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data();
    if (payout.status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', `This final payout is already ${payout.status}.`);
    }
    if (payout.initiatedBy === callerId) {
        throw new https_1.HttpsError('permission-denied', 'Segregation of duties violation: you cannot approve a final payout you initiated.');
    }
    const memberId = payout.memberId;
    if (memberId === callerId) {
        throw new https_1.HttpsError('failed-precondition', 'You cannot approve a final payout for your own account.');
    }
    // Re-verify the ledger: the balance must not have changed since initiation.
    const pos = await getMemberFinancialPosition(db, memberId);
    if (pos.outstandingLoanBalance > 0) {
        throw new https_1.HttpsError('failed-precondition', `Member now has an outstanding loan balance of ${pos.outstandingLoanBalance}. Reject this payout and settle the loan first.`);
    }
    if (Math.abs(pos.totalPayout - (Number(payout.totalPayout) || 0)) > 0.0001) {
        throw new https_1.HttpsError('failed-precondition', `The member's balance changed since this payout was initiated (was ${payout.totalPayout}, now ${pos.totalPayout}). Reject it and ask the Accountant to re-initiate.`);
    }
    // Lock the request to prevent double approval.
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(payoutRef);
        if (((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'pending') {
            throw new https_1.HttpsError('failed-precondition', 'This final payout is no longer pending.');
        }
        tx.update(payoutRef, { status: 'processing', processingStartedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    const approverName = (caller === null || caller === void 0 ? void 0 : caller.name) || (caller === null || caller === void 0 ? void 0 : caller.email) || 'Super Admin';
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
                }
                else {
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
    }
    catch (error) {
        // Release the lock so the payout can be retried or rejected.
        await payoutRef.update({ status: 'pending', lastError: (error === null || error === void 0 ? void 0 : error.message) || String(error) }).catch(() => undefined);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', (error === null || error === void 0 ? void 0 : error.message) || 'Failed to process final payout.');
    }
    // 3. Remove Firebase Auth credentials
    try {
        await admin.auth().deleteUser(memberId);
    }
    catch (e) {
        console.warn('Auth user already deleted or not found:', (e === null || e === void 0 ? void 0 : e.message) || e);
    }
    return { success: true, payoutId, memberId, totalPayout: payout.totalPayout };
});
/**
 * Super Administrator rejects a final payout. The member account is untouched.
 */
exports.rejectFinalPayout = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const callerSnap = await db.collection('users').doc(callerId).get();
    const caller = callerSnap.data();
    if ((caller === null || caller === void 0 ? void 0 : caller.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only Super Administrators can reject a final payout.');
    }
    const { payoutId, rejectionReason } = request.data || {};
    if (!payoutId || typeof payoutId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Payout ID is required.');
    }
    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'A rejection reason is required.');
    }
    const payoutRef = db.collection('final_payouts').doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists)
        throw new https_1.HttpsError('not-found', 'Final payout record not found.');
    const payout = payoutSnap.data();
    if (payout.status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', `This final payout is already ${payout.status}.`);
    }
    const rejecterName = (caller === null || caller === void 0 ? void 0 : caller.name) || (caller === null || caller === void 0 ? void 0 : caller.email) || 'Super Admin';
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
//# sourceMappingURL=final-payout-management.js.map