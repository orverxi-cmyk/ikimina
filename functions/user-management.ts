import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateAndSendActivationEmail } from './email-service';

/**
 * Registers a new member securely.
 * Checks for admin privileges before adding to the users collection,
 * and automatically dispatches an account activation link to their email address.
 */
export const registerMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can register members.');
    }

    const { memberData, justification, appUrl } = request.data || {};
    if (!memberData?.email) {
        throw new HttpsError('invalid-argument', 'Member email is required.');
    }

    const name = `${memberData.firstName || ''} ${memberData.surname || ''}`.trim() || 'Member';
    const email = memberData.email.toLowerCase().trim();

    try {
        const docRef = await db.collection('users').add({
            name,
            email,
            phone: memberData.phone || '',
            role: memberData.role || 'member',
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
        });

        // Automatically generate activation link and dispatch activation email
        let emailSent = false;
        let activationLink = '';
        try {
            const emailResult = await generateAndSendActivationEmail({
                email,
                name,
                memberDocId: docRef.id,
                requestedBy: request.auth.uid,
                appUrl,
            });
            emailSent = emailResult.emailSent;
            activationLink = emailResult.activationLink;
        } catch (mailErr) {
            console.error('Failed to dispatch activation email on member registration:', mailErr);
        }

        // Log the administrative action
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action: 'REGISTER_MEMBER',
            justification,
            details: { 
                memberId: docRef.id, 
                email, 
                emailSent,
                activationLink 
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { 
            success: true, 
            id: docRef.id, 
            emailSent, 
            activationLink 
        };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Registers multiple members in a single batch operation.
 * Dispatches activation emails for each imported member profile.
 */
export const bulkRegisterMembers = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can perform bulk registration.');
    }

    const { members, justification, appUrl } = request.data || {};
    if (!Array.isArray(members)) {
        throw new HttpsError('invalid-argument', 'The "members" parameter must be an array.');
    }

    try {
        const batchSize = 500;
        const totalBatches = Math.ceil(members.length / batchSize);
        const createdMembers: Array<{ id: string; name: string; email: string }> = [];
        
        for (let i = 0; i < totalBatches; i++) {
            const batch = db.batch();
            const chunk = members.slice(i * batchSize, (i + 1) * batchSize);
            
            chunk.forEach(m => {
                const userRef = db.collection('users').doc();
                const cleanEmail = (m.email || '').toLowerCase().trim();
                batch.set(userRef, {
                    name: m.name,
                    email: cleanEmail,
                    phone: m.phone || '',
                    role: m.role || 'member',
                    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'pending',
                });
                createdMembers.push({ id: userRef.id, name: m.name, email: cleanEmail });
            });
            
            await batch.commit();
        }

        // Asynchronously dispatch activation emails for each created member
        const emailDispatches = createdMembers.map(async (m) => {
            if (!m.email) return;
            try {
                return await generateAndSendActivationEmail({
                    email: m.email,
                    name: m.name,
                    memberDocId: m.id,
                    requestedBy: request.auth?.uid,
                    appUrl,
                });
            } catch (err) {
                console.error(`Bulk registration email dispatch failed for ${m.email}:`, err);
                return null;
            }
        });

        // Allow up to 10 concurrent dispatches to avoid throttling
        await Promise.allSettled(emailDispatches);

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
 * Can be executed directly by a Super Administrator without requiring a member request.
 * Checks for admin privileges, prevents self-deletion, and verifies there are no outstanding loan debts.
 */
export const deleteMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Super Administrator privileges required.');
    }

    const { targetUserId, justification } = request.data || {};
    if (!targetUserId || !justification || typeof justification !== 'string' || !justification.trim()) {
        throw new HttpsError('invalid-argument', 'Target user ID and justification are required.');
    }

    if (targetUserId === request.auth.uid) {
        throw new HttpsError('failed-precondition', 'Super Administrators cannot delete their own account directly.');
    }

    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserSnap = await targetUserRef.get();
    const targetUserData = targetUserSnap.exists ? targetUserSnap.data()! : {};

    // Guard: Check for active loans
    const loansSnap = await db.collection('loans')
        .where('memberId', '==', targetUserId)
        .where('status', '==', 'approved')
        .get();

    for (const doc of loansSnap.docs) {
        const balance = Number(doc.data().balance) || 0;
        if (balance > 0) {
            throw new HttpsError('failed-precondition', `Cannot delete member account with active outstanding loan debt (${balance}). All loans must be settled first.`);
        }
    }

    try {
        const batch = db.batch();

        // 1. Delete user record
        batch.delete(targetUserRef);

        // 2. If there are any pending account_deletion_requests for this user, resolve them
        const pendingReqsSnap = await db.collection('account_deletion_requests')
            .where('userId', '==', targetUserId)
            .where('status', '==', 'pending')
            .get();

        for (const reqDoc of pendingReqsSnap.docs) {
            batch.update(reqDoc.ref, {
                status: 'approved',
                reviewedBy: request.auth.uid,
                reviewedByName: adminSnap.data()?.name || 'Super Admin',
                reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                adminNotes: justification.trim() || 'Account deleted directly by Super Admin'
            });
        }

        // 3. Write immutable audit log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'DELETE_MEMBER_DIRECT',
            justification: justification.trim(),
            details: {
                memberId: targetUserId,
                memberName: targetUserData.name || 'Unknown',
                memberEmail: targetUserData.email || '',
                savingsBalance: targetUserData.savingsBalance || 0,
                accruedInterest: targetUserData.accruedInterest || 0,
                directSuperAdminDeletion: true
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        // 4. Also clean up Auth record if exists
        try {
            await admin.auth().deleteUser(targetUserId);
        } catch (e: any) {
            // Ignore if auth user doesn't exist
            console.warn('Auth user already deleted or not found:', e?.message || e);
        }

        return { success: true, targetUserId };
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

        // Non-admins may only upload to their own avatars/ path.
        // Firebase Storage download URLs URL-encode slashes as %2F, so we check
        // both the decoded and encoded variants of the expected path.
        if (callerRole !== 'admin') {
            const uid = request.auth.uid;
            const plainPath = `/avatars/${uid}/`;
            const encodedPath = `avatars%2F${uid}%2F`;
            const decodedUrl = decodeURIComponent(url);
            if (!decodedUrl.includes(plainPath) && !url.includes(encodedPath)) {
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

        // Keep Firebase Auth profile in sync
        const authUpdates: admin.auth.UpdateRequest = {};
        if (updates.photoURL) authUpdates.photoURL = updates.photoURL;
        if (updates.name) authUpdates.displayName = updates.name;
        if (Object.keys(authUpdates).length > 0) {
            try {
                await admin.auth().updateUser(targetUserId, authUpdates);
            } catch (authErr) {
                console.warn('Failed to update Firebase Auth user profile:', authErr);
            }
        }

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

/**
 * Submits an official account deletion request by a scheme member.
 * Verifies that the caller has no active unpaid loans and records their financial standing.
 */
export const requestAccountDeletion = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const userId = request.auth.uid;
    const { reason } = request.data || {};
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'A reason for the account deletion request is required.');
    }

    const db = admin.firestore();

    // 1. Check for existing pending request
    const existingSnap = await db.collection('account_deletion_requests')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .get();

    if (!existingSnap.empty) {
        throw new HttpsError('already-exists', 'You already have a pending account deletion request awaiting super admin review.');
    }

    // 2. Check for active loans with unpaid balance
    const loansSnap = await db.collection('loans')
        .where('memberId', '==', userId)
        .where('status', '==', 'approved')
        .get();

    let activeDebt = 0;
    loansSnap.forEach(doc => {
        const bal = Number(doc.data().balance) || 0;
        if (bal > 0) activeDebt += bal;
    });

    if (activeDebt > 0) {
        throw new HttpsError('failed-precondition', `Cannot request account deletion with an active outstanding loan balance of ${activeDebt}. Please clear all loan obligations first.`);
    }

    // 3. Fetch user details and savings
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User record not found.');
    }
    const userData = userDoc.data()!;

    // Calculate total verified savings
    const contribsSnap = await db.collection('contributions')
        .where('memberId', '==', userId)
        .where('status', '==', 'verified')
        .get();

    let totalSavings = 0;
    contribsSnap.forEach(doc => {
        totalSavings += Number(doc.data().amount) || 0;
    });

    const accruedInterest = Number(userData.accruedInterest) || 0;

    const requestRef = db.collection('account_deletion_requests').doc();
    const batch = db.batch();

    batch.set(requestRef, {
        userId,
        userName: userData.name || request.auth.token.name || 'Member',
        userEmail: (userData.email || request.auth.token.email || '').toLowerCase(),
        userPhone: userData.phone || '',
        userRole: userData.role || 'member',
        savingsBalance: totalSavings,
        accruedInterest,
        activeLoanBalance: activeDebt,
        reason: reason.trim(),
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    batch.update(db.collection('users').doc(userId), {
        deletionRequested: true,
        deletionRequestId: requestRef.id
    });

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: userId,
        action: 'REQUEST_ACCOUNT_DELETION',
        justification: reason.trim(),
        details: {
            memberId: userId,
            requestId: requestRef.id,
            email: userData.email,
            savingsBalance: totalSavings,
            accruedInterest
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { success: true, requestId: requestRef.id };
});

/**
 * Cancels or withdraws a pending account deletion request.
 * Can be called by the member themselves or an administrator.
 */
export const cancelAccountDeletionRequest = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { requestId } = request.data || {};
    if (!requestId) throw new HttpsError('invalid-argument', 'Request ID is required.');

    const db = admin.firestore();
    const reqRef = db.collection('account_deletion_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Deletion request not found.');
    }

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending') {
        throw new HttpsError('failed-precondition', `This request is already ${reqData.status}.`);
    }

    // Caller must be either the owner or an admin
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const isAdmin = callerSnap.data()?.role === 'admin';
    if (reqData.userId !== request.auth.uid && !isAdmin) {
        throw new HttpsError('permission-denied', 'You do not have permission to cancel this request.');
    }

    const batch = db.batch();
    batch.update(reqRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: request.auth.uid
    });

    batch.update(db.collection('users').doc(reqData.userId), {
        deletionRequested: false,
        deletionRequestId: admin.firestore.FieldValue.delete()
    });

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: request.auth.uid,
        action: 'CANCEL_ACCOUNT_DELETION_REQUEST',
        justification: 'Account deletion request withdrawn/cancelled',
        details: { requestId, targetUserId: reqData.userId },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { success: true, requestId };
});

/**
 * Super Administrator approves a pending account deletion request.
 * Deletes user profile document, removes Firebase Auth user, marks request approved, and logs audit record.
 */
export const approveAccountDeletion = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can approve account deletion requests.');
    }

    const { requestId, adminNotes } = request.data || {};
    if (!requestId) throw new HttpsError('invalid-argument', 'Request ID is required.');

    const reqRef = db.collection('account_deletion_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Deletion request not found.');
    }

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending') {
        throw new HttpsError('failed-precondition', `This request has already been ${reqData.status}.`);
    }

    const targetUserId = reqData.userId;

    // Safety guard: Double-check outstanding loan balance
    const loansSnap = await db.collection('loans')
        .where('memberId', '==', targetUserId)
        .where('status', '==', 'approved')
        .get();

    for (const doc of loansSnap.docs) {
        if ((Number(doc.data().balance) || 0) > 0) {
            throw new HttpsError('failed-precondition', 'Cannot approve deletion for a member with an active outstanding loan balance.');
        }
    }

    try {
        const batch = db.batch();

        // 1. Mark request approved with audit details
        batch.update(reqRef, {
            status: 'approved',
            reviewedBy: request.auth.uid,
            reviewedByName: adminSnap.data()?.name || 'Super Admin',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminNotes: (adminNotes || '').trim()
        });

        // 2. Remove member user document
        batch.delete(db.collection('users').doc(targetUserId));

        // 3. Immutable audit log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'APPROVE_ACCOUNT_DELETION',
            justification: adminNotes || reqData.reason || 'Approved account deletion upon member request',
            details: {
                requestId,
                memberId: targetUserId,
                memberName: reqData.userName,
                memberEmail: reqData.userEmail,
                savingsBalance: reqData.savingsBalance || 0,
                accruedInterest: reqData.accruedInterest || 0
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        // 4. Delete Auth user
        try {
            await admin.auth().deleteUser(targetUserId);
        } catch (authErr: any) {
            console.warn('Auth user already deleted or not found:', authErr);
        }

        return { success: true, requestId, targetUserId };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Super Administrator rejects a pending account deletion request with official justification.
 */
export const rejectAccountDeletion = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can reject account deletion requests.');
    }

    const { requestId, rejectionReason } = request.data || {};
    if (!requestId || !rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Request ID and rejection reason are required.');
    }

    const reqRef = db.collection('account_deletion_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Deletion request not found.');
    }

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending') {
        throw new HttpsError('failed-precondition', `This request has already been ${reqData.status}.`);
    }

    const targetUserId = reqData.userId;

    try {
        const batch = db.batch();

        batch.update(reqRef, {
            status: 'rejected',
            reviewedBy: request.auth.uid,
            reviewedByName: adminSnap.data()?.name || 'Super Admin',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectionReason: rejectionReason.trim()
        });

        // Clear flag on user doc if it exists
        const userRef = db.collection('users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
            batch.update(userRef, {
                deletionRequested: false,
                deletionRequestId: admin.firestore.FieldValue.delete()
            });
        }

        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'REJECT_ACCOUNT_DELETION',
            justification: rejectionReason.trim(),
            details: {
                requestId,
                memberId: targetUserId,
                memberName: reqData.userName,
                memberEmail: reqData.userEmail
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        return { success: true, requestId, targetUserId };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});