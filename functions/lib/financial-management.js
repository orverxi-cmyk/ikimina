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
exports.updateFinancialSettings = exports.allocateInterest = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Allocates accumulated interest (profit) to members based on their
 * pro-rata contribution weight in the total pool.
 */
exports.allocateInterest = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can allocate interest.');
    }
    const { totalInterestToDistribute, justification } = request.data;
    if (!totalInterestToDistribute || totalInterestToDistribute <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'A positive interest amount is required.');
    }
    try {
        const contribsSnap = await db.collection('contributions').get();
        const memberTotals = {};
        let totalPool = 0;
        contribsSnap.forEach(doc => {
            const data = doc.data();
            const amount = Number(data.amount) || 0;
            const memberId = data.memberId;
            memberTotals[memberId] = (memberTotals[memberId] || 0) + amount;
            totalPool += amount;
        });
        if (totalPool === 0)
            throw new https_1.HttpsError('failed-precondition', 'Total contribution pool is empty.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Updates global financial settings like default interest rates and borrowing limits.
 */
exports.updateFinancialSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin privileges required.');
    }
    const { currency, loanInterestRate, contributionInterestRate, maxLoanPercentage, minLoanAmount, maxLoanAmount, justification } = request.data;
    try {
        const batch = db.batch();
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            currency: currency || 'RWF',
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
            details: { currency, loanInterestRate, contributionInterestRate, maxLoanPercentage, minLoanAmount, maxLoanAmount },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=financial-management.js.map