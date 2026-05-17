import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Registers a new member securely.
 * Checks for admin privileges before adding to the users collection.
 */
export const registerMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can register members.');
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

        // Log the administrative action
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

/**
 * Registers multiple members in a single batch operation.
 */
export const bulkRegisterMembers = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can perform bulk registration.');
    }

    const { members, justification } = request.data;
    if (!Array.isArray(members)) {
        throw new HttpsError('invalid-argument', 'The "members" parameter must be an array.');
    }

    try {
        const batchSize = 500;
        const totalBatches = Math.ceil(members.length / batchSize);
        
        for (let i = 0; i < totalBatches; i++) {
            const batch = db.batch();
            const chunk = members.slice(i * batchSize, (i + 1) * batchSize);
            
            chunk.forEach(m => {
                const userRef = db.collection('users').doc();
                batch.set(userRef, {
                    name: m.name,
                    email: m.email.toLowerCase(),
                    phone: m.phone || '',
                    role: m.role || 'member',
                    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'pending',
                });
            });
            
            await batch.commit();
        }

        // Log the administrative action
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action: 'BULK_REGISTER_MEMBERS',
            justification,
            details: { count: members.length },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, count: members.length };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Updates a user's role and applies custom claims for security.
 */
export const updateUserRole = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { targetUserId, role, justification } = request.data;

    try {
        await db.collection('users').doc(targetUserId).update({ role });
        
        // Sync role to Custom Claims for Firestore Security Rules efficiency
        await admin.auth().setCustomUserClaims(targetUserId, { [role]: true });

        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action: 'UPDATE_USER_ROLE',
            justification,
            details: { targetUserId, role },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});