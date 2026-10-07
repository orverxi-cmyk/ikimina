
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Lodges a new operational expense.
 * Restricted to Accountant, Admin, and Management.
 * Requires a mandatory supporting document (receipt / invoice / voucher).
 */
export const lodgeExpense = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData?.role;

    const allowedRoles = ['accountant', 'senior_accountant'];
    if (!allowedRoles.includes(callerRole)) {
        throw new HttpsError('permission-denied', 'Only the Accountant or Senior Accountant can lodge operational expenses. Administrators cannot initiate expenses.');
    }

    const { 
        title, 
        category, 
        amount, 
        description, 
        expenseDate, 
        receiptUrl, 
        receiptFileName 
    } = request.data || {};

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A valid positive expense amount is required.');
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
        throw new HttpsError('invalid-argument', 'Expense title or payee is required.');
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
        throw new HttpsError('invalid-argument', 'Expense category is required.');
    }

    if (!receiptUrl || typeof receiptUrl !== 'string' || !receiptUrl.trim()) {
        throw new HttpsError('invalid-argument', 'A supporting document (receipt, invoice, or voucher) is mandatory to justify the expense.');
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
        status: 'pending_review',
        lodgedBy: callerId,
        lodgedByName: userData?.name || userData?.email || 'Accountant',
        lodgedByEmail: userData?.email || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lodgedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
        reviewedByName: null,
        reviewNotes: null,
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
        performedByName: userData?.name || userData?.email || 'Accountant',
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
        message: 'Expense successfully lodged and submitted for review.'
    };
});

/**
 * Step 2: Reviewer or Senior Accountant reviews the lodged expense.
 * Endorsement advances status to 'pending_approval' for Administrator approval.
 */
export const reviewExpense = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData?.role;

    const allowedRoles = ['reviewer', 'senior_accountant', 'management'];
    if (!allowedRoles.includes(callerRole)) {
        throw new HttpsError('permission-denied', 'Only Reviewers or Senior Accountants can review operational expenses. Administrators cannot review expenses.');
    }

    const { expenseId, decision, reviewNotes } = request.data || {};
    if (!expenseId || typeof expenseId !== 'string') {
        throw new HttpsError('invalid-argument', 'Expense ID is required.');
    }
    if (!decision || !['endorse', 'request_changes', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid review decision (endorse, request_changes, or reject) is required.');
    }

    const expenseRef = db.collection('expenses').doc(expenseId);
    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists) {
        throw new HttpsError('not-found', 'Expense record not found.');
    }

    const expense = expenseSnap.data()!;
    const isSeniorAcct = callerRole === 'senior_accountant';

    if (isSeniorAcct) {
        if (expense.status !== 'pending_review' && expense.status !== 'pending' && expense.status !== 'revision_requested') {
            throw new HttpsError('failed-precondition', `Cannot perform initial review on expense with status '${expense.status}'.`);
        }
    } else {
        // Reviewer or Management: ONLY reviews expenses that have been reviewed by Senior Accountant
        if (expense.status !== 'pending_reviewer' && !expense.seniorReviewed) {
            throw new HttpsError('failed-precondition', 'Reviewers can only review expenses that have been initiated and initially reviewed by the Senior Accountant.');
        }
        if (expense.lodgedBy === callerId || expense.recordedBy === callerId) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review an expense you initiated. Another authorized officer must review it.');
        }
    }

    let nextStatus = isSeniorAcct ? 'pending_reviewer' : 'pending_approval';
    let actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_EXPENSE_ENDORSED' : 'REVIEW_EXPENSE_ENDORSED';
    if (decision === 'request_changes') {
        nextStatus = 'revision_requested';
        actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_EXPENSE_REVISION_REQUESTED' : 'REVIEW_EXPENSE_REVISION_REQUESTED';
    } else if (decision === 'reject') {
        nextStatus = 'rejected';
        actionName = isSeniorAcct ? 'SENIOR_ACCOUNTANT_EXPENSE_REJECTED' : 'REVIEW_EXPENSE_REJECTED';
    }

    const reviewerName = userData?.name || userData?.email || (isSeniorAcct ? 'Senior Accountant' : 'Reviewer');

    const updatePayload: any = {
        status: nextStatus
    };

    if (isSeniorAcct) {
        updatePayload.seniorReviewed = true;
        updatePayload.seniorReviewedBy = callerId;
        updatePayload.seniorReviewedByName = reviewerName;
        updatePayload.seniorReviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.seniorReviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    } else {
        updatePayload.complianceReviewed = true;
        updatePayload.reviewedBy = callerId;
        updatePayload.reviewedByName = reviewerName;
        updatePayload.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.reviewNotes = (reviewNotes && typeof reviewNotes === 'string') ? reviewNotes.trim() : null;
    }

    await expenseRef.update(updatePayload);

    await db.collection('audit_logs').add({
        action: actionName,
        performedBy: callerId,
        performedByName: reviewerName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
            expenseId,
            decision,
            nextStatus,
            reviewNotes: reviewNotes || null
        }
    });

    return {
        success: true,
        expenseId,
        status: nextStatus
    };
});

/**
 * Step 3: Administrator Approves a lodged operational expense.
 * Restricted strictly to Administrators and Management.
 * Approved expenses are authoritatively deducted from total institutional assets.
 */
export const approveExpense = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData?.role;

    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only administrators can approve operational expenses.');
    }

    const { expenseId, adminNotes } = request.data || {};
    if (!expenseId || typeof expenseId !== 'string') {
        throw new HttpsError('invalid-argument', 'Expense ID is required.');
    }

    const expenseRef = db.collection('expenses').doc(expenseId);
    const expenseSnap = await expenseRef.get();

    if (!expenseSnap.exists) {
        throw new HttpsError('not-found', 'Expense record not found.');
    }

    const expense = expenseSnap.data()!;
    if (expense.lodgedBy === callerId || expense.recordedBy === callerId || expense.createdBy === callerId) {
        throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot approve an expense you initiated. Another administrator must approve it.');
    }
    if (expense.status !== 'pending_approval') {
        throw new HttpsError('failed-precondition', `Cannot approve expense with status '${expense.status}'. It must be reviewed and endorsed by both Senior Accountant and Compliance Reviewer first.`);
    }

    const approverName = userData?.name || userData?.email || 'Administrator';

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
export const rejectExpense = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerId = request.auth.uid;
    const userSnap = await db.collection('users').doc(callerId).get();
    const userData = userSnap.data();
    const callerRole = userData?.role;

    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only administrators can reject operational expenses.');
    }

    const { expenseId, rejectionReason, adminNotes } = request.data || {};
    if (!expenseId || typeof expenseId !== 'string') {
        throw new HttpsError('invalid-argument', 'Expense ID is required.');
    }

    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
        throw new HttpsError('invalid-argument', 'A reason for rejecting the expense is required.');
    }

    const expenseRef = db.collection('expenses').doc(expenseId);
    const expenseSnap = await expenseRef.get();

    if (!expenseSnap.exists) {
        throw new HttpsError('not-found', 'Expense record not found.');
    }

    const expense = expenseSnap.data()!;
    if (expense.lodgedBy === callerId || expense.recordedBy === callerId || expense.createdBy === callerId) {
        throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot reject an expense you initiated. Another administrator must reject it.');
    }
    if (!['pending', 'pending_review', 'pending_approval', 'revision_requested'].includes(expense.status)) {
        throw new HttpsError('failed-precondition', `Cannot reject expense with status '${expense.status}'.`);
    }

    const rejecterName = userData?.name || userData?.email || 'Administrator';

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
