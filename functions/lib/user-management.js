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
exports.activateMemberAccount = exports.updateMemberProfile = exports.deleteMember = exports.updateUserRole = exports.bulkRegisterMembers = exports.registerMember = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Registers a new member securely.
 * Checks for admin privileges before adding to the users collection.
 */
exports.registerMember = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can register members.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Registers multiple members in a single batch operation.
 */
exports.bulkRegisterMembers = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can perform bulk registration.');
    }
    const { members, justification } = request.data;
    if (!Array.isArray(members)) {
        throw new https_1.HttpsError('invalid-argument', 'The "members" parameter must be an array.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Updates a user's role and applies custom claims for security.
 */
exports.updateUserRole = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin privileges required.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Deletes or revokes access for a member securely.
 * Checks for admin privileges and verifies there are no outstanding loan debts.
 */
exports.deleteMember = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin privileges required.');
    }
    const { targetUserId, justification } = request.data || {};
    if (!targetUserId || !justification) {
        throw new https_1.HttpsError('invalid-argument', 'Target user ID and justification are required.');
    }
    // Guard: Check for active loans
    const loansSnap = await db.collection('loans')
        .where('memberId', '==', targetUserId)
        .where('status', '==', 'approved')
        .get();
    for (const doc of loansSnap.docs) {
        if ((Number(doc.data().balance) || 0) > 0) {
            throw new https_1.HttpsError('failed-precondition', 'Cannot remove a member with an active outstanding loan balance.');
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
        }
        catch (e) {
            // Ignore if auth user doesn't exist
        }
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Updates a member's contact profile (name, phone) securely.
 * Can be performed by admins or the member themselves.
 */
exports.updateMemberProfile = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const { targetUserId, name, phone } = request.data || {};
    if (!targetUserId)
        throw new https_1.HttpsError('invalid-argument', 'Target user ID is required.');
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = (_a = callerSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
    if (callerRole !== 'admin' && request.auth.uid !== targetUserId) {
        throw new https_1.HttpsError('permission-denied', 'You can only update your own profile.');
    }
    const updates = {};
    if (typeof name === 'string' && name.trim().length > 0)
        updates.name = name.trim();
    if (typeof phone === 'string')
        updates.phone = phone.trim();
    try {
        await db.collection('users').doc(targetUserId).update(updates);
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Activates an invited member's account.
 * Atomically links pre-created member profile with new Firebase Auth UID.
 */
exports.activateMemberAccount = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const { memberDocId } = request.data || {};
    if (!memberDocId)
        throw new https_1.HttpsError('invalid-argument', 'Member document ID is required.');
    const db = admin.firestore();
    const currentUid = request.auth.uid;
    try {
        if (memberDocId !== currentUid) {
            const oldDocRef = db.collection('users').doc(memberDocId);
            const oldDocSnap = await oldDocRef.get();
            if (!oldDocSnap.exists) {
                throw new https_1.HttpsError('not-found', 'Pre-registered member invitation not found.');
            }
            const oldData = oldDocSnap.data();
            const batch = db.batch();
            batch.set(db.collection('users').doc(currentUid), Object.assign(Object.assign({}, oldData), { email: (request.auth.token.email || oldData.email || '').toLowerCase(), status: 'active', activatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            batch.delete(oldDocRef);
            // Re-point any contributions or loans that used the old temp doc ID
            const contribs = await db.collection('contributions').where('memberId', '==', memberDocId).get();
            contribs.forEach(c => batch.update(c.ref, { memberId: currentUid }));
            const loans = await db.collection('loans').where('memberId', '==', memberDocId).get();
            loans.forEach(l => batch.update(l.ref, { memberId: currentUid }));
            await batch.commit();
        }
        else {
            await db.collection('users').doc(currentUid).update({
                status: 'active',
                activatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=user-management.js.map