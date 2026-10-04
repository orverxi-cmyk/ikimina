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
exports.rejectExpense = exports.approveExpense = exports.lodgeExpense = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Lodges a new operational expense.
 * Restricted to Accountant, Admin, and Management.
 * Requires a mandatory supporting document (receipt / invoice / voucher).
 */
exports.lodgeExpense = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData === null || userData === void 0 ? void 0 : userData.role;
    const allowedRoles = ['accountant', 'admin', 'management'];
    if (!allowedRoles.includes(callerRole)) {
        throw new https_1.HttpsError('permission-denied', 'Only the Accountant or Administrators can lodge operational expenses.');
    }
    const { title, category, amount, description, expenseDate, receiptUrl, receiptFileName } = request.data || {};
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'A valid positive expense amount is required.');
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Expense title or payee is required.');
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Expense category is required.');
    }
    if (!receiptUrl || typeof receiptUrl !== 'string' || !receiptUrl.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'A supporting document (receipt, invoice, or voucher) is mandatory to justify the expense.');
    }
    const expenseRef = db.collection('expenses').doc();
    const expenseData = {
        title: title.trim(),
        category: category.trim(),
        amount: numericAmount,
        description: (description && typeof description === 'string') ? description.trim() : '',
        expenseDate: expenseDate || new Date().toISOString().split('T')[0],
        receiptUrl: receiptUrl.trim(),
        receiptFileName: (receiptFileName && typeof receiptFileName === 'string') ? receiptFileName.trim() : 'receipt_document',
        status: 'pending',
        lodgedBy: callerId,
        lodgedByName: (userData === null || userData === void 0 ? void 0 : userData.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Accountant',
        lodgedByEmail: (userData === null || userData === void 0 ? void 0 : userData.email) || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lodgedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        adminNotes: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null
    };
    await expenseRef.set(expenseData);
    // Audit log
    await db.collection('audit_logs').add({
        action: 'LODGE_EXPENSE',
        performedBy: callerId,
        performedByName: (userData === null || userData === void 0 ? void 0 : userData.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Accountant',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            expenseId: expenseRef.id,
            title: expenseData.title,
            category: expenseData.category,
            amount: numericAmount,
            receiptUrl: expenseData.receiptUrl,
            status: 'pending'
        }
    });
    return {
        success: true,
        expenseId: expenseRef.id,
        message: 'Expense successfully lodged and submitted for administrator approval.'
    };
});
/**
 * Approves a lodged operational expense.
 * Restricted strictly to Administrators and Management.
 * Approved expenses are authoritatively deducted from total institutional assets.
 */
exports.approveExpense = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData === null || userData === void 0 ? void 0 : userData.role;
    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can approve operational expenses.');
    }
    const { expenseId, adminNotes } = request.data || {};
    if (!expenseId || typeof expenseId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Expense ID is required.');
    }
    const expenseRef = db.collection('expenses').doc(expenseId);
    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Expense record not found.');
    }
    const expense = expenseSnap.data();
    if (expense.recordedBy === callerId || expense.createdBy === callerId) {
        throw new https_1.HttpsError('permission-denied', 'Segregation of duties violation: You cannot approve an expense you initiated. Another administrator must approve it.');
    }
    if (expense.status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', `Cannot approve expense with status '${expense.status}'. Only pending expenses can be approved.`);
    }
    const approverName = (userData === null || userData === void 0 ? void 0 : userData.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Administrator';
    await expenseRef.update({
        status: 'approved',
        approvedBy: callerId,
        approvedByName: approverName,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotes: (adminNotes && typeof adminNotes === 'string') ? adminNotes.trim() : null
    });
    // Record authoritative audit trail
    await db.collection('audit_logs').add({
        action: 'APPROVE_EXPENSE',
        performedBy: callerId,
        performedByName: approverName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            expenseId,
            title: expense.title,
            category: expense.category,
            amount: expense.amount,
            lodgedBy: expense.lodgedBy,
            lodgedByName: expense.lodgedByName,
            receiptUrl: expense.receiptUrl,
            adminNotes: adminNotes || null,
            impact: `Deducted ${expense.amount} from total group assets`
        }
    });
    return {
        success: true,
        expenseId,
        message: `Expense of ${expense.amount} approved. Subtracted from total assets.`
    };
});
/**
 * Rejects a lodged operational expense.
 * Restricted strictly to Administrators and Management.
 */
exports.rejectExpense = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData === null || userData === void 0 ? void 0 : userData.role;
    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can reject operational expenses.');
    }
    const { expenseId, rejectionReason, adminNotes } = request.data || {};
    if (!expenseId || typeof expenseId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Expense ID is required.');
    }
    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'A reason for rejecting the expense is required.');
    }
    const expenseRef = db.collection('expenses').doc(expenseId);
    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Expense record not found.');
    }
    const expense = expenseSnap.data();
    if (expense.status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', `Cannot reject expense with status '${expense.status}'. Only pending expenses can be rejected.`);
    }
    const rejecterName = (userData === null || userData === void 0 ? void 0 : userData.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Administrator';
    await expenseRef.update({
        status: 'rejected',
        rejectedBy: callerId,
        rejectedByName: rejecterName,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: rejectionReason.trim(),
        adminNotes: (adminNotes && typeof adminNotes === 'string') ? adminNotes.trim() : null
    });
    // Record audit log
    await db.collection('audit_logs').add({
        action: 'REJECT_EXPENSE',
        performedBy: callerId,
        performedByName: rejecterName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            expenseId,
            title: expense.title,
            category: expense.category,
            amount: expense.amount,
            lodgedBy: expense.lodgedBy,
            lodgedByName: expense.lodgedByName,
            rejectionReason: rejectionReason.trim(),
            adminNotes: adminNotes || null
        }
    });
    return {
        success: true,
        expenseId,
        message: 'Expense has been rejected.'
    };
});
//# sourceMappingURL=expense-management.js.map