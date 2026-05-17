import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * Allocates accumulated interest (profit) to members based on their 
 * pro-rata contribution weight in the total pool.
 */
export const allocateInterest = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();

    if (adminData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can allocate interest.');
    }

    const { totalInterestToDistribute, justification } = request.data;
    if (!totalInterestToDistribute || totalInterestToDistribute <= 0) {
        throw new HttpsError('invalid-argument', 'A positive interest amount is required.');
    }

    try {
        // 1. Get all contributions to calculate weights
        const contribsSnap = await db.collection('contributions').get();
        const memberTotals: { [memberId: string]: number } = {};
        let totalPool = 0;

        contribsSnap.forEach(doc => {
            const data = doc.data();
            const amount = Number(data.amount) || 0;
            const memberId = data.memberId;
            memberTotals[memberId] = (memberTotals[memberId] || 0) + amount;
            totalPool += amount;
        });

        if (totalPool === 0) throw new HttpsError('failed-precondition', 'Total contribution pool is empty.');

        // 2. Calculate and apply shares
        const membersSnap = await db.collection('users').get();
        const batch = db.batch();
        let recipientsCount = 0;

        membersSnap.forEach(memberDoc => {
            const memberId = memberDoc.id;
            const memberTotal = memberTotals[memberId] || 0;
            
            if (memberTotal > 0) {
                const shareRatio = memberTotal / totalPool;
                const memberShare = Math.floor(totalInterestToDistribute * shareRatio);
                
                if (memberShare > 0) {
                    batch.update(memberDoc.ref, {
                        accruedInterest: admin.firestore.FieldValue.increment(memberShare)
                    });
                    recipientsCount++;
                }
            }
        });

        // 3. Log the audit record
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'ALLOCATE_INTEREST',
            justification,
            details: { 
                totalDistributed: totalInterestToDistribute, 
                totalPool,
                recipientsCount
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true, recipients: recipientsCount };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});
