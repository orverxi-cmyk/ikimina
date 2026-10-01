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
exports.rejectContribution = exports.verifyContribution = exports.recordContribution = exports.submitContribution = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Submits a regular member contribution for management verification.
 * Server authoritatively binds memberId to auth.uid and forces status to 'pending'.
 */
exports.submitContribution = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const { amount, period, proofUrl } = request.data || {};
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'A valid contribution amount greater than 0 is required.');
    }
    if (!period || typeof period !== 'string' || period.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Contribution period is required.');
    }
    if (!proofUrl || typeof proofUrl !== 'string' || proofUrl.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Proof of payment URL is required.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Securely records a member contribution.
 * Performed on server to ensure audit integrity.
 */
exports.recordContribution = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only authorized personnel can record contributions.');
    }
    const { memberId, amount, period, justification } = request.data;
    if (!memberId || !amount || !period || !justification) {
        throw new https_1.HttpsError('invalid-argument', 'All fields including justification are required.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Verifies a pending contribution submitted by a member.
 */
exports.verifyContribution = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only authorized personnel can verify contributions.');
    }
    const { contributionId, justification } = request.data;
    if (!contributionId || !justification) {
        throw new https_1.HttpsError('invalid-argument', 'Contribution ID and justification are required.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Rejects a pending contribution submitted by a member.
 */
exports.rejectContribution = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only authorized personnel can reject contributions.');
    }
    const { contributionId, rejectionReason } = request.data;
    if (!contributionId || !rejectionReason) {
        throw new https_1.HttpsError('invalid-argument', 'Contribution ID and rejection reason are required.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=contribution-management.js.map