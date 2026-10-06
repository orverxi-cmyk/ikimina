
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Submits a regular member contribution for management verification.
 * Server authoritatively binds memberId to auth.uid and forces status to 'pending'.
 */
export const submitContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { amount, period, proofUrl } = request.data || {};
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
        throw new HttpsError('invalid-argument', 'A valid contribution amount greater than 0 is required.');
    }

    if (!period || typeof period !== 'string' || period.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Contribution period is required.');
    }

    if (!proofUrl || typeof proofUrl !== 'string' || proofUrl.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Proof of payment URL is required.');
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Securely records a member contribution.
 * Performed on server to ensure audit integrity.
 */
export const recordContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can record contributions.');
    }

    const { memberId, amount, period, justification } = request.data;

    if (!memberId || !amount || !period || !justification) {
        throw new HttpsError('invalid-argument', 'All fields including justification are required.');
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Verifies a pending contribution submitted by a member.
 */
export const verifyContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admin can verify contributions.');
    }

    const { contributionId, justification } = request.data;

    if (!contributionId || !justification) {
        throw new HttpsError('invalid-argument', 'Contribution ID and justification are required.');
    }

    try {
        const contributionRef = db.collection('contributions').doc(contributionId);
        const contribSnap = await contributionRef.get();
        if (!contribSnap.exists) {
            throw new HttpsError('not-found', 'Contribution not found.');
        }
        const contribData = contribSnap.data()!;
        if (contribData.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', 'Cannot approve. Contribution must be reviewed first. (Current status: ' + contribData.status + ')');
        }
        if (contribData.memberId === request.auth.uid || contribData.recordedBy === request.auth.uid) {
            throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot verify your own deposit submission or a transaction you recorded.');
        }

        const batch = db.batch();
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Rejects a pending contribution submitted by a member.
 */
export const rejectContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can reject contributions.');
    }

    const { contributionId, rejectionReason } = request.data;

    if (!contributionId || !rejectionReason) {
        throw new HttpsError('invalid-argument', 'Contribution ID and rejection reason are required.');
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Bulk uploads staff source-deducted contributions from an Excel sheet.
 * Can be performed by an Administrator or Accountant.
 * Creates verified contributions with paymentMethod: 'payroll_deduction'.
 */
export const bulkUploadContributions = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'admin' && callerRole !== 'accountant' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only administrators or accountants can perform bulk contribution uploads.');
    }

    const { items, defaultPeriod, justification } = request.data || {};

    if (!Array.isArray(items) || items.length === 0) {
        throw new HttpsError('invalid-argument', 'At least one contribution item is required.');
    }

    if (items.length > 500) {
        throw new HttpsError('invalid-argument', 'Maximum 500 items per bulk upload batch.');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let totalAmount = 0;
    const validContributions: any[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const memberId = item.memberId?.trim();
        const amount = Number(item.amount);
        const period = (item.period || defaultPeriod || '').trim();

        if (!memberId) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} is missing a memberId.`);
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} has an invalid amount (${item.amount}).`);
        }
        if (!period) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} is missing a contribution period.`);
        }

        totalAmount += amount;
        
        let deductionTimestamp = admin.firestore.FieldValue.serverTimestamp();
        if (item.deductionDate) {
            const parsed = new Date(item.deductionDate);
            if (!isNaN(parsed.getTime())) {
                deductionTimestamp = admin.firestore.Timestamp.fromDate(parsed) as any;
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
            notes: item.notes?.trim() || `Staff source deduction for ${period}`,
            staffName: item.staffName?.trim() || null,
            staffEmail: item.staffEmail?.trim() || null,
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
                    period: defaultPeriod || validContributions[0]?.period || '',
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message || 'Failed to process bulk contributions upload.');
    }
});

/**
 * Step 1: Accountant initiates a contribution batch (e.g. populating existing or payroll contributions).
 * Stages the records in 'pending_review' state awaiting checker review.
 */
export const initiateContributionBatch = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'accountant' && callerRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only accountants or administrators can initiate contribution upload batches.');
    }

    const { items, title, defaultPeriod, type, justification } = request.data || {};

    if (!Array.isArray(items) || items.length === 0) {
        throw new HttpsError('invalid-argument', 'At least one contribution item is required.');
    }

    if (items.length > 500) {
        throw new HttpsError('invalid-argument', 'Maximum 500 items per contribution batch.');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let totalAmount = 0;
    const validatedItems: any[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const memberId = item.memberId?.trim();
        const amount = Number(item.amount);
        const period = (item.period || defaultPeriod || '').trim();

        if (!memberId) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} is missing a memberId.`);
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} has an invalid amount (${item.amount}).`);
        }
        if (!period) {
            throw new HttpsError('invalid-argument', `Item at row ${i + 1} is missing a contribution period.`);
        }

        totalAmount += amount;

        validatedItems.push({
            memberId,
            staffName: item.staffName?.trim() || 'Staff Member',
            staffEmail: item.staffEmail?.trim() || '',
            amount,
            period,
            deductionDate: item.deductionDate || null,
            notes: item.notes?.trim() || `Contribution for ${period}`
        });
    }

    const batchDocRef = db.collection('contribution_batches').doc(batchId);
    await batchDocRef.set({
        batchId,
        title: title?.trim() || `Staff Contributions - ${defaultPeriod || 'Historical Migration'}`,
        type: type || 'historical_migration',
        status: 'pending_review',
        items: validatedItems,
        totalCount: validatedItems.length,
        totalAmount,
        defaultPeriod: defaultPeriod || '',
        justification: justification?.trim() || 'Population of existing member contributions',
        initiatedBy: request.auth.uid,
        initiatorName: callerData?.name || callerData?.email || 'Accountant',
        initiatorRole: callerRole,
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        auditTrail: [
            {
                action: 'INITIATED',
                performedBy: request.auth.uid,
                performerName: callerData?.name || callerData?.email || 'Accountant',
                performerRole: callerRole,
                timestamp: new Date().toISOString(),
                notes: justification?.trim() || 'Batch initiated and submitted for review.'
            }
        ]
    });

    const auditRef = db.collection('audit_logs').doc();
    await auditRef.set({
        adminId: request.auth.uid,
        action: 'INITIATE_CONTRIBUTION_BATCH',
        justification: justification || `Initiated contribution batch ${batchId}`,
        details: {
            batchId,
            itemCount: validatedItems.length,
            totalAmount,
            status: 'pending_review'
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        batchId,
        totalCount: validatedItems.length,
        totalAmount,
        status: 'pending_review'
    };
});

/**
 * Step 2: Reviewer reviews the staged batch.
 * Can endorse (moves to 'pending_approval'), request changes, or reject.
 */
export const reviewContributionBatch = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'management' && callerRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only designated reviewers, management, or administrators can review contribution batches.');
    }

    const { batchId, decision, reviewNotes } = request.data || {};

    if (!batchId) {
        throw new HttpsError('invalid-argument', 'Batch ID is required.');
    }

    if (!decision || !['endorse', 'request_changes', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid decision (endorse, request_changes, reject) is required.');
    }

    if (!reviewNotes || !reviewNotes.trim()) {
        throw new HttpsError('invalid-argument', 'Review notes are required.');
    }

    const batchRef = db.collection('contribution_batches').doc(batchId);
    const batchSnap = await batchRef.get();

    if (!batchSnap.exists) {
        throw new HttpsError('not-found', `Contribution batch ${batchId} was not found.`);
    }

    const batchData = batchSnap.data()!;
    if (batchData.initiatedBy === request.auth.uid) {
        throw new HttpsError('permission-denied', 'Segregation of duties violation: You cannot review a batch you initiated. Another authorized officer must conduct the review.');
    }
    if (batchData.status !== 'pending_review' && batchData.status !== 'revision_requested') {
        throw new HttpsError('failed-precondition', `Cannot review batch with status '${batchData.status}'. Must be 'pending_review'.`);
    }

    let nextStatus: string;
    let actionName: string;

    if (decision === 'endorse') {
        nextStatus = 'pending_approval';
        actionName = 'REVIEW_ENDORSED';
    } else if (decision === 'request_changes') {
        nextStatus = 'revision_requested';
        actionName = 'REVIEW_REVISION_REQUESTED';
    } else {
        nextStatus = 'rejected';
        actionName = 'REVIEW_REJECTED';
    }

    const newAuditEvent = {
        action: actionName,
        performedBy: request.auth.uid,
        performerName: callerData?.name || callerData?.email || 'Reviewer',
        performerRole: callerRole,
        timestamp: new Date().toISOString(),
        notes: reviewNotes.trim()
    };

    await batchRef.update({
        status: nextStatus,
        reviewedBy: request.auth.uid,
        reviewerName: callerData?.name || callerData?.email || 'Reviewer',
        reviewerRole: callerRole,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewNotes: reviewNotes.trim(),
        auditTrail: admin.firestore.FieldValue.arrayUnion(newAuditEvent)
    });

    const auditRef = db.collection('audit_logs').doc();
    await auditRef.set({
        adminId: request.auth.uid,
        action: actionName,
        justification: reviewNotes.trim(),
        details: {
            batchId,
            decision,
            nextStatus
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        batchId,
        status: nextStatus
    };
});

/**
 * Step 3: Super Administrator gives final approval.
 * Writes all staged items into the official 'contributions' ledger and updates batch to 'approved'.
 */
export const approveContributionBatch = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only Super Administrators can provide final approval and commit contribution batches to the ledger.');
    }

    const { batchId, decision, approvalNotes } = request.data || {};

    if (!batchId) {
        throw new HttpsError('invalid-argument', 'Batch ID is required.');
    }

    if (!decision || !['approve', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid decision (approve or reject) is required.');
    }

    if (!approvalNotes || !approvalNotes.trim()) {
        throw new HttpsError('invalid-argument', 'Approval/rejection notes are required.');
    }

    const batchRef = db.collection('contribution_batches').doc(batchId);
    const batchSnap = await batchRef.get();

    if (!batchSnap.exists) {
        throw new HttpsError('not-found', `Contribution batch ${batchId} was not found.`);
    }

    const batchData = batchSnap.data()!;
    if (batchData.initiatedBy === request.auth.uid) {
        throw new HttpsError('permission-denied', 'Segregation of duties violation: The initiator of a batch cannot approve it. Another Super Administrator must approve and commit it.');
    }
    if (batchData.status !== 'pending_approval') {
        throw new HttpsError('failed-precondition', `Cannot approve batch with status '${batchData.status}'. Must be 'pending_approval'.`);
    }

    if (decision === 'reject') {
        const rejectAuditEvent = {
            action: 'ADMIN_REJECTED',
            performedBy: request.auth.uid,
            performerName: callerData?.name || callerData?.email || 'Super Admin',
            performerRole: callerRole,
            timestamp: new Date().toISOString(),
            notes: approvalNotes.trim()
        };

        await batchRef.update({
            status: 'rejected',
            approvedBy: request.auth.uid,
            approverName: callerData?.name || callerData?.email || 'Super Admin',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvalNotes: approvalNotes.trim(),
            auditTrail: admin.firestore.FieldValue.arrayUnion(rejectAuditEvent)
        });

        return { success: true, batchId, status: 'rejected' };
    }

    // Decision is 'approve' -> Commit all staged items to official contributions collection
    const items = batchData.items || [];
    if (items.length === 0) {
        throw new HttpsError('invalid-argument', 'Batch contains no items to commit.');
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const item of chunk) {
            const contribRef = db.collection('contributions').doc();
            let deductionDateVal = admin.firestore.FieldValue.serverTimestamp();
            if (item.deductionDate) {
                const parsed = new Date(item.deductionDate);
                if (!isNaN(parsed.getTime())) {
                    deductionDateVal = admin.firestore.Timestamp.fromDate(parsed) as any;
                }
            }

            batch.set(contribRef, {
                memberId: item.memberId,
                amount: Number(item.amount),
                period: item.period || batchData.defaultPeriod || '',
                date: deductionDateVal,
                status: 'verified',
                paymentMethod: batchData.type === 'historical_migration' ? 'historical_migration' : 'payroll_deduction',
                source: batchData.type === 'historical_migration' ? 'historical_migration' : 'payroll_deduction',
                batchId: batchData.batchId,
                batchTitle: batchData.title,
                notes: item.notes || `Populated via Batch ${batchData.batchId}`,
                staffName: item.staffName || null,
                staffEmail: item.staffEmail || null,
                recordedBy: batchData.initiatedBy,
                approvedBy: request.auth.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        if (i === 0) {
            // Update batch document
            const approveAuditEvent = {
                action: 'COMMITTED_TO_LEDGER',
                performedBy: request.auth.uid,
                performerName: callerData?.name || callerData?.email || 'Super Admin',
                performerRole: callerRole,
                timestamp: new Date().toISOString(),
                notes: approvalNotes.trim()
            };

            batch.update(batchRef, {
                status: 'approved',
                approvedBy: request.auth.uid,
                approverName: callerData?.name || callerData?.email || 'Super Admin',
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                approvalNotes: approvalNotes.trim(),
                auditTrail: admin.firestore.FieldValue.arrayUnion(approveAuditEvent)
            });

            // Audit log
            const auditRef = db.collection('audit_logs').doc();
            batch.set(auditRef, {
                adminId: request.auth.uid,
                action: 'APPROVE_CONTRIBUTION_BATCH',
                justification: approvalNotes.trim(),
                details: {
                    batchId,
                    totalCount: batchData.totalCount,
                    totalAmount: batchData.totalAmount,
                    initiatedBy: batchData.initiatedBy,
                    reviewedBy: batchData.reviewedBy
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
    }

    return {
        success: true,
        batchId,
        count: items.length,
        totalAmount: batchData.totalAmount,
        status: 'approved'
    };
});

/**
 * Bulk reviews multiple contribution batches simultaneously.
 * Role: reviewer, management, admin
 */
export const bulkReviewContributionBatches = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'management' && callerRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only authorized Reviewers or Administrators can review contribution batches.');
    }

    const { batchIds, decision, reviewNotes } = request.data || {};

    if (!Array.isArray(batchIds) || batchIds.length === 0) {
        throw new HttpsError('invalid-argument', 'An array of batch IDs is required.');
    }

    if (!decision || !['endorse', 'request_changes', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid decision (endorse, request_changes, reject) is required.');
    }

    if (!reviewNotes || !reviewNotes.trim()) {
        throw new HttpsError('invalid-argument', 'Review notes are required.');
    }

    let nextStatus: string;
    let actionName: string;

    if (decision === 'endorse') {
        nextStatus = 'pending_approval';
        actionName = 'BULK_REVIEW_ENDORSED';
    } else if (decision === 'request_changes') {
        nextStatus = 'revision_requested';
        actionName = 'BULK_REVIEW_REVISION_REQUESTED';
    } else {
        nextStatus = 'rejected';
        actionName = 'BULK_REVIEW_REJECTED';
    }

    const newAuditEvent = {
        action: actionName,
        performedBy: request.auth.uid,
        performerName: callerData?.name || callerData?.email || 'Reviewer',
        performerRole: callerRole,
        timestamp: new Date().toISOString(),
        notes: reviewNotes.trim()
    };

    let processedCount = 0;
    const errors: string[] = [];

    for (const batchId of batchIds) {
        try {
            const batchRef = db.collection('contribution_batches').doc(batchId);
            const batchSnap = await batchRef.get();
            if (!batchSnap.exists) {
                errors.push(`Batch ${batchId} not found.`);
                continue;
            }

            const batchData = batchSnap.data()!;
            if (batchData.initiatedBy === request.auth.uid) {
                errors.push(`Batch ${batchId}: Cannot review your own initiated batch (Segregation of duties).`);
                continue;
            }
            if (batchData.status !== 'pending_review' && batchData.status !== 'revision_requested') {
                errors.push(`Batch ${batchId} is in status '${batchData.status}', not pending review.`);
                continue;
            }

            await batchRef.update({
                status: nextStatus,
                reviewedBy: request.auth.uid,
                reviewerName: callerData?.name || callerData?.email || 'Reviewer',
                reviewerRole: callerRole,
                reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                reviewNotes: reviewNotes.trim(),
                auditTrail: admin.firestore.FieldValue.arrayUnion(newAuditEvent)
            });

            const auditRef = db.collection('audit_logs').doc();
            await auditRef.set({
                adminId: request.auth.uid,
                action: actionName,
                justification: reviewNotes.trim(),
                details: {
                    batchId,
                    decision,
                    nextStatus,
                    bulk: true
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            processedCount++;
        } catch (err: any) {
            errors.push(`Batch ${batchId}: ${err.message}`);
        }
    }

    return {
        success: true,
        processedCount,
        totalRequested: batchIds.length,
        status: nextStatus,
        errors
    };
});

/**
 * Bulk approves multiple contribution batches simultaneously.
 * Role: strictly admin (Super Administrator).
 * Commits all staged items across all specified batches to the 'contributions' collection with status 'verified'.
 */
export const bulkApproveContributionBatches = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'admin') {
        throw new HttpsError('permission-denied', 'Only Super Administrators can provide final approval and commit contribution batches to the ledger.');
    }

    const { batchIds, decision, approvalNotes } = request.data || {};

    if (!Array.isArray(batchIds) || batchIds.length === 0) {
        throw new HttpsError('invalid-argument', 'An array of batch IDs is required.');
    }

    if (!decision || !['approve', 'reject'].includes(decision)) {
        throw new HttpsError('invalid-argument', 'Valid decision (approve or reject) is required.');
    }

    if (!approvalNotes || !approvalNotes.trim()) {
        throw new HttpsError('invalid-argument', 'Approval/rejection notes are required.');
    }

    let processedBatches = 0;
    let totalItemsCommitted = 0;
    let totalAmountCommitted = 0;
    const errors: string[] = [];

    for (const batchId of batchIds) {
        try {
            const batchRef = db.collection('contribution_batches').doc(batchId);
            const batchSnap = await batchRef.get();

            if (!batchSnap.exists) {
                errors.push(`Batch ${batchId} not found.`);
                continue;
            }

            const batchData = batchSnap.data()!;
            if (batchData.initiatedBy === request.auth.uid) {
                errors.push(`Batch ${batchId}: Cannot approve your own initiated batch (Segregation of duties).`);
                continue;
            }
            if (batchData.status !== 'pending_approval') {
                errors.push(`Batch ${batchId} has status '${batchData.status}', not pending approval.`);
                continue;
            }

            if (decision === 'reject') {
                const rejectAuditEvent = {
                    action: 'BULK_ADMIN_REJECTED',
                    performedBy: request.auth.uid,
                    performerName: callerData?.name || callerData?.email || 'Super Admin',
                    performerRole: callerRole,
                    timestamp: new Date().toISOString(),
                    notes: approvalNotes.trim()
                };

                await batchRef.update({
                    status: 'rejected',
                    approvedBy: request.auth.uid,
                    approverName: callerData?.name || callerData?.email || 'Super Admin',
                    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                    approvalNotes: approvalNotes.trim(),
                    auditTrail: admin.firestore.FieldValue.arrayUnion(rejectAuditEvent)
                });

                processedBatches++;
                continue;
            }

            // Commit items
            const items = batchData.items || [];
            const CHUNK_SIZE = 400;

            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk = items.slice(i, i + CHUNK_SIZE);
                const writeBatch = db.batch();

                for (const item of chunk) {
                    const contribRef = db.collection('contributions').doc();
                    let deductionDateVal = admin.firestore.FieldValue.serverTimestamp();
                    if (item.deductionDate) {
                        const parsed = new Date(item.deductionDate);
                        if (!isNaN(parsed.getTime())) {
                            deductionDateVal = admin.firestore.Timestamp.fromDate(parsed) as any;
                        }
                    }

                    writeBatch.set(contribRef, {
                        memberId: item.memberId,
                        amount: Number(item.amount),
                        period: item.period || batchData.defaultPeriod || '',
                        date: deductionDateVal,
                        status: 'verified',
                        paymentMethod: batchData.type === 'historical_migration' ? 'historical_migration' : 'payroll_deduction',
                        source: batchData.type === 'historical_migration' ? 'historical_migration' : 'payroll_deduction',
                        batchId: batchData.batchId,
                        batchTitle: batchData.title,
                        notes: item.notes || `Populated via Batch ${batchData.batchId}`,
                        staffName: item.staffName || null,
                        staffEmail: item.staffEmail || null,
                        recordedBy: batchData.initiatedBy,
                        approvedBy: request.auth.uid,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                if (i === 0) {
                    const approveAuditEvent = {
                        action: 'BULK_COMMITTED_TO_LEDGER',
                        performedBy: request.auth.uid,
                        performerName: callerData?.name || callerData?.email || 'Super Admin',
                        performerRole: callerRole,
                        timestamp: new Date().toISOString(),
                        notes: approvalNotes.trim()
                    };

                    writeBatch.update(batchRef, {
                        status: 'approved',
                        approvedBy: request.auth.uid,
                        approverName: callerData?.name || callerData?.email || 'Super Admin',
                        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                        approvalNotes: approvalNotes.trim(),
                        auditTrail: admin.firestore.FieldValue.arrayUnion(approveAuditEvent)
                    });

                    const auditRef = db.collection('audit_logs').doc();
                    writeBatch.set(auditRef, {
                        adminId: request.auth.uid,
                        action: 'BULK_APPROVE_CONTRIBUTION_BATCH',
                        justification: approvalNotes.trim(),
                        details: {
                            batchId,
                            totalCount: batchData.totalCount,
                            totalAmount: batchData.totalAmount,
                            bulk: true
                        },
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                await writeBatch.commit();
            }

            processedBatches++;
            totalItemsCommitted += items.length;
            totalAmountCommitted += Number(batchData.totalAmount || 0);
        } catch (err: any) {
            errors.push(`Batch ${batchId}: ${err.message}`);
        }
    }

    return {
        success: true,
        processedBatches,
        totalRequested: batchIds.length,
        totalItemsCommitted,
        totalAmountCommitted,
        decision,
        errors
    };
});

/**
 * Bulk verifies multiple individual pending contributions.
 */
export const bulkVerifyContributions = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant' && adminData?.role !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can verify contributions.');
    }

    const { contributionIds, justification } = request.data || {};

    if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
        throw new HttpsError('invalid-argument', 'An array of contribution IDs is required.');
    }

    if (!justification || !justification.trim()) {
        throw new HttpsError('invalid-argument', 'Justification is required.');
    }

    const CHUNK_SIZE = 400;
    let verifiedCount = 0;

    for (let i = 0; i < contributionIds.length; i += CHUNK_SIZE) {
        const chunk = contributionIds.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const cid of chunk) {
            const ref = db.collection('contributions').doc(cid);
            batch.update(ref, {
                status: 'verified',
                verifiedBy: request.auth.uid,
                verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                justification: justification.trim()
            });

            const logRef = db.collection('audit_logs').doc();
            batch.set(logRef, {
                adminId: request.auth.uid,
                action: 'BULK_VERIFY_CONTRIBUTIONS',
                justification: justification.trim(),
                details: { contributionId: cid, bulk: true },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            verifiedCount++;
        }

        await batch.commit();
    }

    return { success: true, count: verifiedCount };
});

/**
 * Bulk rejects multiple individual pending contributions.
 */
export const bulkRejectContributions = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant' && adminData?.role !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can reject contributions.');
    }

    const { contributionIds, rejectionReason } = request.data || {};

    if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
        throw new HttpsError('invalid-argument', 'An array of contribution IDs is required.');
    }

    if (!rejectionReason || !rejectionReason.trim()) {
        throw new HttpsError('invalid-argument', 'Rejection reason is required.');
    }

    const CHUNK_SIZE = 400;
    let rejectedCount = 0;

    for (let i = 0; i < contributionIds.length; i += CHUNK_SIZE) {
        const chunk = contributionIds.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const cid of chunk) {
            const ref = db.collection('contributions').doc(cid);
            batch.update(ref, {
                status: 'rejected',
                rejectedBy: request.auth.uid,
                rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
                rejectionReason: rejectionReason.trim()
            });

            const logRef = db.collection('audit_logs').doc();
            batch.set(logRef, {
                adminId: request.auth.uid,
                action: 'BULK_REJECT_CONTRIBUTIONS',
                justification: rejectionReason.trim(),
                details: { contributionId: cid, bulk: true },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            rejectedCount++;
        }

        await batch.commit();
    }

    return { success: true, count: rejectedCount };
});

/**
 * Reverses an approved/verified contribution.
 * Role: admin, management
 * Reverts status to 'reversed', deducting it from active savings aggregations and borrowing power.
 */
export const reverseContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only Administrators and Management can reverse contribution approvals.');
    }

    const { contributionId, justification } = request.data || {};

    if (!contributionId) {
        throw new HttpsError('invalid-argument', 'Contribution ID is required.');
    }

    if (!justification || !justification.trim()) {
        throw new HttpsError('invalid-argument', 'A formal justification is required to reverse an approved contribution.');
    }

    const contribRef = db.collection('contributions').doc(contributionId);
    const contribSnap = await contribRef.get();

    if (!contribSnap.exists) {
        throw new HttpsError('not-found', 'Contribution record not found.');
    }

    const contribData = contribSnap.data()!;
    if (contribData.status !== 'verified') {
        throw new HttpsError('failed-precondition', `Cannot reverse contribution with status '${contribData.status}'. Only 'verified' contributions can be reversed.`);
    }

    const batch = db.batch();
    batch.update(contribRef, {
        status: 'reversed',
        reversedBy: request.auth.uid,
        reversedByName: callerData?.name || callerData?.email || 'Admin',
        reversedAt: admin.firestore.FieldValue.serverTimestamp(),
        reversalJustification: justification.trim()
    });

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
        adminId: request.auth.uid,
        action: 'REVERSE_CONTRIBUTION_APPROVAL',
        justification: justification.trim(),
        details: {
            contributionId,
            memberId: contribData.memberId,
            amount: contribData.amount,
            period: contribData.period,
            batchId: contribData.batchId || null
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return {
        success: true,
        contributionId,
        status: 'reversed'
    };
});

/**
 * Bulk reverses multiple approved/verified contributions.
 * Role: admin, management
 */
export const bulkReverseContributions = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    const callerRole = callerData?.role;

    if (callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only Administrators and Management can reverse contribution approvals.');
    }

    const { contributionIds, justification } = request.data || {};

    if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
        throw new HttpsError('invalid-argument', 'An array of contribution IDs is required.');
    }

    if (!justification || !justification.trim()) {
        throw new HttpsError('invalid-argument', 'A formal justification is required for bulk reversal.');
    }

    const CHUNK_SIZE = 400;
    let reversedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < contributionIds.length; i += CHUNK_SIZE) {
        const chunk = contributionIds.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const cid of chunk) {
            const ref = db.collection('contributions').doc(cid);
            batch.update(ref, {
                status: 'reversed',
                reversedBy: request.auth.uid,
                reversedByName: callerData?.name || callerData?.email || 'Admin',
                reversedAt: admin.firestore.FieldValue.serverTimestamp(),
                reversalJustification: justification.trim()
            });

            const logRef = db.collection('audit_logs').doc();
            batch.set(logRef, {
                adminId: request.auth.uid,
                action: 'BULK_REVERSE_CONTRIBUTIONS',
                justification: justification.trim(),
                details: { contributionId: cid, bulk: true },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            reversedCount++;
        }

        await batch.commit();
    }

    return { success: true, count: reversedCount, errors };
});




export const reviewContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review contributions.');
    }

    const { contributionId, justification } = request.data;
    if (!contributionId) throw new HttpsError('invalid-argument', 'Contribution ID is required.');

    const contributionRef = db.collection('contributions').doc(contributionId);
    const contribSnap = await contributionRef.get();
    if (!contribSnap.exists) throw new HttpsError('not-found', 'Contribution not found.');
    
    const contribData = contribSnap.data()!;
    if (contribData.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Contribution is currently in ' + contribData.status + ' status, cannot be reviewed.');
    }

    await contributionRef.update({
        status: 'reviewed',
        reviewedBy: request.auth.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewJustification: justification || 'Reviewed'
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_CONTRIBUTION',
        justification: justification || 'Reviewed',
        details: { contributionId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
