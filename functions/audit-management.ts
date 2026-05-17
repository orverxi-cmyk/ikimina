import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * General purpose secure logging for any administrative action.
 */
export const logAdminAction = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (userSnap.data()?.role !== 'admin' && userSnap.data()?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Administrative access required for logging.');
    }

    const { action, justification, details } = request.data;
    
    try {
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action,
            justification,
            details: details || {},
            ipAddress: request.rawRequest.ip || 'internal',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', 'Audit logging failed.');
    }
});