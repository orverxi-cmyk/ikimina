
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Logs an administrative action to the secure audit trail.
 * Required for all sensitive financial and membership changes.
 */
export const logAdminAction = onCall({ cors: true }, async (request) => {
    // 1. Authentication & Authorization
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Verify admin role from user document
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userData = userSnap.data();
    
    if (!userData || userData.role !== 'admin') {
        throw new HttpsError('permission-denied', 'You must be an administrator to perform this action.');
    }

    const { action, justification, details } = request.data;
    if (!action || !justification) {
        throw new HttpsError('invalid-argument', 'Action and justification are required.');
    }

    const adminId = request.auth.uid;
    const ipAddress = request.rawRequest.ip || 'unknown';

    try {
        const logData = {
            adminId,
            action,
            justification,
            details: details || {},
            ipAddress,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection('audit_logs').add(logData);
        logger.info('Admin action logged successfully', logData);
        return { success: true };

    } catch (error: any) {
        logger.error('Failed to log admin action', { error: error.message, adminId, action });
        throw new HttpsError('internal', 'Failed to write to audit log.');
    }
});

/**
 * Securely registers a new member via Admin SDK.
 */
export const registerMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { memberData, justification } = request.data;
    const name = `${memberData.firstName} ${memberData.surname}`.trim();

    try {
        const docRef = await db.collection('users').add({
            name,
            email: memberData.email.toLowerCase(),
            phone: memberData.phone || '',
            role: memberData.role || 'member',
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
        });

        // Log the registration
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action: 'REGISTER_MEMBER',
            justification,
            details: { memberId: docRef.id, email: memberData.email },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, id: docRef.id };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});
