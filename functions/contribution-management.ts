
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

    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can verify contributions.');
    }

    const { contributionId, justification } = request.data;

    if (!contributionId || !justification) {
        throw new HttpsError('invalid-argument', 'Contribution ID and justification are required.');
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
