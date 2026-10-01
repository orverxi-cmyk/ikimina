
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Submits a regular member contribution for management verification.
 * Server authoritatively binds memberId to auth.uid and forces status to 'pending'.
 */
export const submitContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { amount, period, proofUrl } = request.data || {};
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A valid contribution amount greater than 0 is required.');
    }

    if (!period || typeof period !== 'string' || period.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Contribution period is required.');
    }

    if (!proofUrl || typeof proofUrl !== 'string' || proofUrl.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Proof of payment URL is required.');
    }

    try {
        const db = admin.firestore();
        const contributionRef = db.collection('contributions').doc();

        await contributionRef.set({
            memberId: request.auth.uid,
            amount: parsedAmount,
            period: period.trim(),
            date: admin.firestore.FieldValue.serverTimestamp(),
            proofUrl: proofUrl.trim(),
            status: 'pending',
            justification: `Self-submitted contribution for ${period.trim()}`
        });

        return { success: true, id: contributionRef.id };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Securely records a member contribution.
 * Performed on server to ensure audit integrity.
 */
export const recordContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can record contributions.');
    }

    const { memberId, amount, period, justification } = request.data;

    if (!memberId || !amount || !period || !justification) {
        throw new HttpsError('invalid-argument', 'All fields including justification are required.');
    }

    try {
        const batch = db.batch();
        const contributionRef = db.collection('contributions').doc();

        batch.set(contributionRef, {
            memberId,
            amount: Number(amount),
            period,
            date: admin.firestore.FieldValue.serverTimestamp(),
            recordedBy: request.auth.uid,
            status: 'verified'
        });

        // Log the action
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'RECORD_CONTRIBUTION',
            justification,
            details: { memberId, amount, period },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
        return { success: true, id: contributionRef.id };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Verifies a pending contribution submitted by a member.
 */
export const verifyContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can verify contributions.');
    }

    const { contributionId, justification } = request.data;

    if (!contributionId || !justification) {
        throw new HttpsError('invalid-argument', 'Contribution ID and justification are required.');
    }

    try {
        const batch = db.batch();
        const contributionRef = db.collection('contributions').doc(contributionId);
        
        batch.update(contributionRef, {
            status: 'verified',
            verifiedBy: request.auth.uid,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            justification
        });

        // Log the action
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'VERIFY_CONTRIBUTION',
            justification,
            details: { contributionId },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Rejects a pending contribution submitted by a member.
 */
export const rejectContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can reject contributions.');
    }

    const { contributionId, rejectionReason } = request.data;

    if (!contributionId || !rejectionReason) {
        throw new HttpsError('invalid-argument', 'Contribution ID and rejection reason are required.');
    }

    try {
        const batch = db.batch();
        const contributionRef = db.collection('contributions').doc(contributionId);
        
        batch.update(contributionRef, {
            status: 'rejected',
            rejectedBy: request.auth.uid,
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectionReason
        });

        // Log the action
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'REJECT_CONTRIBUTION',
            justification: rejectionReason,
            details: { contributionId },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});
