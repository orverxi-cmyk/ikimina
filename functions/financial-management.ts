
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

/**
 * Updates global financial settings like default interest rates and borrowing limits.
 */
export const updateFinancialSettings = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { 
        loanInterestRate, 
        contributionInterestRate, 
        maxLoanPercentage, 
        minLoanAmount, 
        maxLoanAmount,
        justification 
    } = request.data;

    try {
        const batch = db.batch();
        const settingsRef = db.collection('settings').doc('financials');
        
        batch.set(settingsRef, {
            loanInterestRate: Number(loanInterestRate),
            contributionInterestRate: Number(contributionInterestRate),
            maxLoanPercentage: Number(maxLoanPercentage),
            minLoanAmount: Number(minLoanAmount),
            maxLoanAmount: Number(maxLoanAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid
        }, { merge: true });

        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'UPDATE_FINANCIAL_SETTINGS',
            justification,
            details: { loanInterestRate, contributionInterestRate, maxLoanPercentage, minLoanAmount, maxLoanAmount },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true };
    } catch (error: any) {
        throw new HttpsError('internal', error.message);
    }
});
