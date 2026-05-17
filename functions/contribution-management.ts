
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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
