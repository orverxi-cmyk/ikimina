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
exports.bulkUploadContributions = exports.rejectContribution = exports.verifyContribution = exports.recordContribution = exports.submitContribution = void 0;
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
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'accountant') {
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
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'accountant') {
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
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'management' && (adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'accountant') {
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
/**
 * Bulk uploads staff source-deducted contributions from an Excel sheet.
 * Can be performed by an Administrator or Accountant.
 * Creates verified contributions with paymentMethod: 'payroll_deduction'.
 */
exports.bulkUploadContributions = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData === null || callerData === void 0 ? void 0 : callerData.role;
    if (callerRole !== 'admin' && callerRole !== 'accountant' && callerRole !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators or accountants can perform bulk contribution uploads.');
    }
    const { items, defaultPeriod, justification } = request.data || {};
    if (!Array.isArray(items) || items.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'At least one contribution item is required.');
    }
    if (items.length > 500) {
        throw new https_1.HttpsError('invalid-argument', 'Maximum 500 items per bulk upload batch.');
    }
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let totalAmount = 0;
    const validContributions = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const memberId = (_a = item.memberId) === null || _a === void 0 ? void 0 : _a.trim();
        const amount = Number(item.amount);
        const period = (item.period || defaultPeriod || '').trim();
        if (!memberId) {
            throw new https_1.HttpsError('invalid-argument', `Item at row ${i + 1} is missing a memberId.`);
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new https_1.HttpsError('invalid-argument', `Item at row ${i + 1} has an invalid amount (${item.amount}).`);
        }
        if (!period) {
            throw new https_1.HttpsError('invalid-argument', `Item at row ${i + 1} is missing a contribution period.`);
        }
        totalAmount += amount;
        let deductionTimestamp = admin.firestore.FieldValue.serverTimestamp();
        if (item.deductionDate) {
            const parsed = new Date(item.deductionDate);
            if (!isNaN(parsed.getTime())) {
                deductionTimestamp = admin.firestore.Timestamp.fromDate(parsed);
            }
        }
        validContributions.push({
            memberId,
            amount,
            period,
            date: deductionTimestamp,
            status: 'verified',
            paymentMethod: 'payroll_deduction',
            source: 'payroll_deduction',
            recordedBy: request.auth.uid,
            batchId,
            notes: ((_b = item.notes) === null || _b === void 0 ? void 0 : _b.trim()) || `Staff source deduction for ${period}`,
            staffName: ((_c = item.staffName) === null || _c === void 0 ? void 0 : _c.trim()) || null,
            staffEmail: ((_d = item.staffEmail) === null || _d === void 0 ? void 0 : _d.trim()) || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    try {
        // Write in chunks of 400 (safe limit for Firestore batches of 500)
        const CHUNK_SIZE = 400;
        for (let i = 0; i < validContributions.length; i += CHUNK_SIZE) {
            const chunk = validContributions.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            for (const record of chunk) {
                const docRef = db.collection('contributions').doc();
                batch.set(docRef, record);
            }
            // In the first chunk, also record the audit log and bulk batch metadata
            if (i === 0) {
                const auditRef = db.collection('audit_logs').doc();
                batch.set(auditRef, {
                    adminId: request.auth.uid,
                    action: 'BULK_SOURCE_DEDUCTIONS',
                    justification: justification || `Bulk source deductions upload for ${defaultPeriod || 'payroll period'}`,
                    details: {
                        batchId,
                        totalCount: validContributions.length,
                        totalAmount,
                        defaultPeriod: defaultPeriod || null,
                        recordedByRole: callerRole
                    },
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                const batchDocRef = db.collection('contribution_batches').doc(batchId);
                batch.set(batchDocRef, {
                    batchId,
                    uploaderId: request.auth.uid,
                    uploaderRole: callerRole,
                    totalCount: validContributions.length,
                    totalAmount,
                    period: defaultPeriod || ((_e = validContributions[0]) === null || _e === void 0 ? void 0 : _e.period) || '',
                    source: 'payroll_deduction',
                    justification: justification || 'Monthly staff source deductions',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            await batch.commit();
        }
        return {
            success: true,
            batchId,
            count: validContributions.length,
            totalAmount
        };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message || 'Failed to process bulk contributions upload.');
    }
});
//# sourceMappingURL=contribution-management.js.map