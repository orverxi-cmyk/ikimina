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

/**
 * Deletes or revokes access for a member securely.
 * Checks for admin privileges and verifies there are no outstanding loan debts.
 */
export const deleteMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { targetUserId, justification } = request.data || {};
    if (!targetUserId || !justification) {
        throw new HttpsError('invalid-argument', 'Target user ID and justification are required.');
    }

    // Guard: Check for active loans
    const loansSnap = await db.collection('loans')
        .where('memberId', '==', targetUserId)
        .where('status', '==', 'approved')
        .get();

    for (const doc of loansSnap.docs) {
        if ((Number(doc.data().balance) || 0) > 0) {
            throw new HttpsError('failed-precondition', 'Cannot remove a member with an active outstanding loan balance.');
        }
    }

    try {
        const batch = db.batch();
        batch.delete(db.collection('users').doc(targetUserId));

        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'DELETE_MEMBER',
            justification,
            details: { memberId: targetUserId },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        // Also clean up Auth record if exists
        try {
            await admin.auth().deleteUser(targetUserId);
        } catch (e: any) {
            // Ignore if auth user doesn't exist
        }

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Updates a member's contact profile (name, phone, photoURL) securely.
 * Can be performed by admins or the member themselves.
 * photoURL must point to the caller's own Firebase Storage avatars path.
 */
export const updateMemberProfile = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { targetUserId, name, phone, photoURL } = request.data || {};
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Target user ID is required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'admin' && request.auth.uid !== targetUserId) {
        throw new HttpsError('permission-denied', 'You can only update your own profile.');
    }

    const updates: Record<string, any> = {};
    if (typeof name === 'string' && name.trim().length > 0) updates.name = name.trim();
    if (typeof phone === 'string') updates.phone = phone.trim();

    // Validate and accept photoURL — must be a Firebase Storage URL for the
    // caller's own avatars/{uid}/ path (or admin updating any user).
    if (typeof photoURL === 'string' && photoURL.trim().length > 0) {
        const url = photoURL.trim();
        const isFirebaseStorageUrl =
            url.startsWith('https://firebasestorage.googleapis.com') ||
            url.startsWith('https://storage.googleapis.com');

        if (!isFirebaseStorageUrl) {
            throw new HttpsError('invalid-argument', 'photoURL must be a Firebase Storage URL.');
        }

        // Non-admins may only upload to their own avatars/ path
        if (callerRole !== 'admin') {
            const expectedPath = `/avatars/${request.auth.uid}/`;
            if (!url.includes(expectedPath)) {
                throw new HttpsError('permission-denied', 'You may only set a photo from your own avatars storage path.');
            }
        }

        updates.photoURL = url;
    }

    if (Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'No valid fields provided to update.');
    }

    try {
        await db.collection('users').doc(targetUserId).update(updates);
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Activates an invited member's account.
 * Atomically links pre-created member profile with new Firebase Auth UID.
 */
export const activateMemberAccount = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { memberDocId } = request.data || {};
    if (!memberDocId) throw new HttpsError('invalid-argument', 'Member document ID is required.');

    const db = admin.firestore();
    const currentUid = request.auth.uid;

    try {
        if (memberDocId !== currentUid) {
            const oldDocRef = db.collection('users').doc(memberDocId);
            const oldDocSnap = await oldDocRef.get();
            if (!oldDocSnap.exists) {
                throw new HttpsError('not-found', 'Pre-registered member invitation not found.');
            }

            const oldData = oldDocSnap.data()!;
            const batch = db.batch();

            batch.set(db.collection('users').doc(currentUid), {
                ...oldData,
                email: (request.auth.token.email || oldData.email || '').toLowerCase(),
                status: 'active',
                activatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            batch.delete(oldDocRef);

            // Re-point any contributions or loans that used the old temp doc ID
            const contribs = await db.collection('contributions').where('memberId', '==', memberDocId).get();
            contribs.forEach(c => batch.update(c.ref, { memberId: currentUid }));

            const loans = await db.collection('loans').where('memberId', '==', memberDocId).get();
            loans.forEach(l => batch.update(l.ref, { memberId: currentUid }));

            await batch.commit();
        } else {
            await db.collection('users').doc(currentUid).update({
                status: 'active',
                activatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});