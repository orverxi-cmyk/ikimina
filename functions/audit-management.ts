import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * General purpose secure logging for any administrative action.
 */
export const logAdminAction = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    
    const userData = userSnap.data();
    const userRole = userData?.role;
    const isStaffRole = ['admin', 'management', 'accountant', 'reviewer', 'auditor'].includes(userRole);
    if (!isStaffRole) {
        throw new HttpsError('permission-denied', 'Administrative or auditor access required for logging.');
    }

    const { action, justification, details } = request.data;
    
    try {
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            performedBy: request.auth.uid,
            performedByName: userData?.name || userData?.email || 'Staff Member',
            performedByRole: userRole || 'staff',
            action,
            justification: justification || '',
            details: details || {},
            ipAddress: request.rawRequest.ip || 'internal',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', 'Audit logging failed.');
    }
});