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
exports.setMemberPayoutPreference = exports.closeInterestPayoutCampaign = exports.openInterestPayoutCampaign = exports.getSystemSettings = exports.resetFinancialData = exports.updateFinancialSettings = exports.allocateInterest = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Allocates accumulated interest (profit) to members based on their
 * pro-rata contribution weight in the total pool.
 */
exports.allocateInterest = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const adminUid = request.auth.uid;
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(adminUid).get();
    const adminData = adminSnap.data();
    if ((adminData === null || adminData === void 0 ? void 0 : adminData.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can allocate interest.');
    }
    const { totalInterestToDistribute, justification } = request.data;
    if (!totalInterestToDistribute || totalInterestToDistribute <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'A positive interest amount is required.');
    }
    try {
        // 1. Calculate Total Realized Group Interest from Loans
        const loansSnap = await db.collection('loans').get();
        let totalRealizedInterest = 0;
        loansSnap.forEach(doc => {
            const loan = doc.data();
            if (loan.status === 'completed' || loan.status === 'approved') {
                totalRealizedInterest += Number(loan.interestAmount) || 0;
            }
        });
        // 2. Calculate Previously Distributed Group Interest
        const auditSnap = await db.collection('audit_logs').where('action', '==', 'ALLOCATE_INTEREST').get();
        let previouslyDistributed = 0;
        auditSnap.forEach(doc => {
            var _a, _b;
            previouslyDistributed += Number((_b = (_a = doc.data()) === null || _a === void 0 ? void 0 : _a.details) === null || _b === void 0 ? void 0 : _b.totalDistributed) || 0;
        });
        // 3. Available Undistributed Profit Guardrail
        const availableToDistribute = Math.max(0, totalRealizedInterest - previouslyDistributed);
        if (totalInterestToDistribute > availableToDistribute) {
            throw new https_1.HttpsError('failed-precondition', `Cannot distribute ${totalInterestToDistribute}. Available undistributed profit is ${availableToDistribute} (Total Earned: ${totalRealizedInterest}, Already Distributed: ${previouslyDistributed}).`);
        }
        // 4. Calculate Member Contribution Totals
        const contribsSnap = await db.collection('contributions').get();
        const memberTotals = {};
        let totalPool = 0;
        contribsSnap.forEach(doc => {
            const data = doc.data();
            // Only count verified contributions
            if (data.status === 'verified') {
                const amount = Number(data.amount) || 0;
                const memberId = data.memberId;
                memberTotals[memberId] = (memberTotals[memberId] || 0) + amount;
                totalPool += amount;
            }
        });
        if (totalPool === 0)
            throw new https_1.HttpsError('failed-precondition', 'Total contribution pool is empty.');
        const membersSnap = await db.collection('users').get();
        const batch = db.batch();
        const distRef = db.collection('interest_distributions').doc();
        const currentPeriod = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
        let recipientsCount = 0;
        let capitalizedCount = 0;
        let cashPayoutCount = 0;
        let totalCapitalizedToContributions = 0;
        let totalCashPayout = 0;
        const breakdown = [];
        membersSnap.forEach(memberDoc => {
            const memberId = memberDoc.id;
            const memberData = memberDoc.data();
            const memberTotal = memberTotals[memberId] || 0;
            const previousAccruedInterest = Number(memberData.accruedInterest) || 0;
            // Read member's payout election preference (default: receive_payout)
            const preference = memberData.interestPayoutPreference || memberData.payoutPreference || 'receive_payout';
            if (memberTotal > 0) {
                const shareRatio = memberTotal / totalPool;
                const memberShare = Math.floor(totalInterestToDistribute * shareRatio);
                if (memberShare > 0) {
                    if (preference === 'add_to_contribution') {
                        // EXCLUDED from cash payout. Credited directly as a verified contribution to their total contributions!
                        const contribRef = db.collection('contributions').doc();
                        batch.set(contribRef, {
                            memberId,
                            amount: memberShare,
                            period: currentPeriod,
                            date: admin.firestore.FieldValue.serverTimestamp(),
                            proofUrl: '',
                            status: 'verified',
                            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                            verifiedBy: adminUid,
                            justification: `Interest profit capitalized into total savings (Distribution ${distRef.id})`,
                            type: 'interest_reinvestment'
                        });
                        totalCapitalizedToContributions += memberShare;
                        capitalizedCount++;
                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            distributedShare: memberShare,
                            payoutType: 'add_to_contribution',
                            outcome: 'Added to Total Contribution Savings',
                            previousAccruedInterest,
                            newTotalAccruedInterest: previousAccruedInterest
                        });
                    }
                    else {
                        // Received as Payout / Accrued Interest
                        batch.update(memberDoc.ref, {
                            accruedInterest: admin.firestore.FieldValue.increment(memberShare)
                        });
                        totalCashPayout += memberShare;
                        cashPayoutCount++;
                        breakdown.push({
                            memberId,
                            memberName: memberData.name || 'Unknown',
                            memberEmail: memberData.email || '',
                            contributions: memberTotal,
                            shareRatio,
                            distributedShare: memberShare,
                            payoutType: 'receive_payout',
                            outcome: 'Accrued for Liquid Cash Payout',
                            previousAccruedInterest,
                            newTotalAccruedInterest: previousAccruedInterest + memberShare
                        });
                    }
                    recipientsCount++;
                }
            }
        });
        // 5. Permanent Ledger Entry in interest_distributions
        batch.set(distRef, {
            distributedAt: admin.firestore.FieldValue.serverTimestamp(),
            adminId: request.auth.uid,
            amountDistributed: totalInterestToDistribute,
            totalPool,
            totalRealizedInterest,
            previouslyDistributed,
            availableBeforeDistribution: availableToDistribute,
            availableAfterDistribution: availableToDistribute - totalInterestToDistribute,
            justification,
            recipientsCount,
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout,
            breakdown
        });
        // 6. Audit Log
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'ALLOCATE_INTEREST',
            justification,
            details: {
                distributionId: distRef.id,
                totalDistributed: totalInterestToDistribute,
                totalPool,
                recipientsCount,
                capitalizedCount,
                cashPayoutCount,
                totalCapitalizedToContributions,
                totalCashPayout,
                availableAfter: availableToDistribute - totalInterestToDistribute
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        // 7. Conclude active payout campaign in settings if open
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            payoutCampaign: {
                status: 'closed',
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastDistributionId: distRef.id,
                lastDistributionAmount: totalInterestToDistribute
            }
        }, { merge: true });
        await batch.commit();
        return {
            success: true,
            recipients: recipientsCount,
            capitalizedCount,
            cashPayoutCount,
            totalCapitalizedToContributions,
            totalCashPayout,
            availableAfter: availableToDistribute - totalInterestToDistribute,
            distributionId: distRef.id
        };
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
    const { currency, loanInterestRate, interestModel, interestType, contributionInterestRate, maxLoanPercentage, maxLendingPoolPercentage, minLoanAmount, penaltyRate, depositBankName, depositAccountNumber, infrastructureBranding, appName, aboutUs, termsOfService, privacyPolicy, copyrightNotice, justification } = request.data;
    try {
        const batch = db.batch();
        const settingsRef = db.collection('settings').doc('financials');
        batch.set(settingsRef, {
            currency: currency || 'RWF',
            loanInterestRate: Number(loanInterestRate),
            interestModel: interestModel || 'one-off',
            interestType: interestType || 'immediate',
            contributionInterestRate: Number(contributionInterestRate),
            maxLoanPercentage: Number(maxLoanPercentage),
            maxLendingPoolPercentage: maxLendingPoolPercentage !== undefined ? Number(maxLendingPoolPercentage) : 90,
            minLoanAmount: Number(minLoanAmount),
            penaltyRate: Number(penaltyRate || 2),
            depositBankName: depositBankName ? String(depositBankName).trim() : '',
            depositAccountNumber: depositAccountNumber ? String(depositAccountNumber).trim() : '',
            infrastructureBranding: infrastructureBranding !== undefined ? String(infrastructureBranding).trim() : 'Secure Infrastructure Provided by ORVEXI',
            appName: appName !== undefined ? String(appName).trim() : 'Ikimina App',
            aboutUs: aboutUs !== undefined ? String(aboutUs).trim() : '',
            termsOfService: termsOfService !== undefined ? String(termsOfService).trim() : '',
            privacyPolicy: privacyPolicy !== undefined ? String(privacyPolicy).trim() : '',
            copyrightNotice: copyrightNotice !== undefined ? String(copyrightNotice).trim() : '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid
        }, { merge: true });
        const logRef = db.collection('audit_logs').doc();
        batch.set(logRef, {
            adminId: request.auth.uid,
            action: 'UPDATE_FINANCIAL_SETTINGS',
            justification,
            details: {
                currency,
                loanInterestRate,
                interestModel,
                interestType,
                depositBankName,
                depositAccountNumber,
                contributionInterestRate,
                maxLoanPercentage,
                maxLendingPoolPercentage: maxLendingPoolPercentage !== undefined ? Number(maxLendingPoolPercentage) : 90,
                minLoanAmount,
                penaltyRate,
                infrastructureBranding,
                appName,
                hasCustomAbout: !!aboutUs,
                hasCustomTerms: !!termsOfService,
                hasCustomPrivacy: !!privacyPolicy
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Super Admin Action: Resets all financial metrics to zero.
 * Wipes contributions, loans, repayments, and interest distributions.
 * Resets all member accruedInterest balances to 0.
 * Preserves user accounts, credentials, profiles, and platform configuration.
 */
exports.resetFinancialData = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    const adminData = adminSnap.data();
    const isSuperAdmin = (adminData === null || adminData === void 0 ? void 0 : adminData.isSuperAdmin) === true ||
        request.auth.token.email === 'tharushyamagara@gmail.com' ||
        (adminData === null || adminData === void 0 ? void 0 : adminData.email) === 'tharushyamagara@gmail.com';
    if (!isSuperAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only a verified Super Administrator can reset all financial data.');
    }
    const { justification } = request.data || {};
    if (!justification || typeof justification !== 'string' || justification.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'An audit justification is strictly required to reset financial data.');
    }
    try {
        const contribsSnap = await db.collection('contributions').get();
        const loansSnap = await db.collection('loans').get();
        const repaymentsSnap = await db.collection('repayments').get();
        const distributionsSnap = await db.collection('interest_distributions').get();
        const auditSnap = await db.collection('audit_logs').where('action', '==', 'ALLOCATE_INTEREST').get();
        const usersSnap = await db.collection('users').get();
        let batch = db.batch();
        let opCount = 0;
        const commitBatchIfNeeded = async () => {
            if (opCount >= 400) {
                await batch.commit();
                batch = db.batch();
                opCount = 0;
            }
        };
        for (const doc of contribsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }
        for (const doc of loansSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }
        for (const doc of repaymentsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }
        for (const doc of distributionsSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }
        for (const doc of auditSnap.docs) {
            batch.delete(doc.ref);
            opCount++;
            await commitBatchIfNeeded();
        }
        for (const doc of usersSnap.docs) {
            batch.update(doc.ref, {
                accruedInterest: 0,
                totalContributed: 0
            });
            opCount++;
            await commitBatchIfNeeded();
        }
        // Record permanent audit log of the financial reset
        const resetAuditRef = db.collection('audit_logs').doc();
        batch.set(resetAuditRef, {
            adminId: request.auth.uid,
            adminEmail: request.auth.token.email || (adminData === null || adminData === void 0 ? void 0 : adminData.email) || 'tharushyamagara@gmail.com',
            action: 'RESET_FINANCIAL_DATA',
            justification,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: {
                contributionsDeleted: contribsSnap.size,
                loansDeleted: loansSnap.size,
                repaymentsDeleted: repaymentsSnap.size,
                distributionsDeleted: distributionsSnap.size,
                usersReset: usersSnap.size
            }
        });
        opCount++;
        if (opCount > 0) {
            await batch.commit();
        }
        return {
            success: true,
            summary: {
                contributionsDeleted: contribsSnap.size,
                loansDeleted: loansSnap.size,
                repaymentsDeleted: repaymentsSnap.size,
                distributionsDeleted: distributionsSnap.size,
                usersReset: usersSnap.size
            }
        };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Returns the current system-wide financial policy settings.
 * Any authenticated user can call this — it is a read-only operation.
 * This is the ONLY authorised way for the client to read settings;
 * pages must not directly query settings/financials via Firestore.
 */
exports.getSystemSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    const db = admin.firestore();
    const snap = await db.collection('settings').doc('financials').get();
    if (!snap.exists) {
        // Return safe defaults if the document hasn't been created yet
        return {
            currency: 'RWF',
            loanInterestRate: 10,
            interestModel: 'one-off',
            interestType: 'immediate',
            contributionInterestRate: 50000,
            maxLoanPercentage: 200,
            maxLendingPoolPercentage: 90,
            minLoanAmount: 5000,
            penaltyRate: 2,
            depositBankName: '',
            depositAccountNumber: '',
            infrastructureBranding: 'Secure Infrastructure Provided by ORVEXI',
            appName: 'Ikimina App',
            aboutUs: '',
            termsOfService: '',
            privacyPolicy: '',
            copyrightNotice: '',
            payoutCampaign: { status: 'closed' }
        };
    }
    const data = snap.data();
    return {
        currency: data.currency || 'RWF',
        loanInterestRate: Number(data.loanInterestRate) || 10,
        interestModel: data.interestModel || 'one-off',
        interestType: data.interestType || 'immediate',
        contributionInterestRate: Number(data.contributionInterestRate) || 50000,
        maxLoanPercentage: Number(data.maxLoanPercentage) || 200,
        maxLendingPoolPercentage: data.maxLendingPoolPercentage !== undefined ? Number(data.maxLendingPoolPercentage) : 90,
        minLoanAmount: Number(data.minLoanAmount) || 5000,
        penaltyRate: Number(data.penaltyRate) || 2,
        depositBankName: data.depositBankName || '',
        depositAccountNumber: data.depositAccountNumber || '',
        infrastructureBranding: data.infrastructureBranding || 'Secure Infrastructure Provided by ORVEXI',
        appName: data.appName || 'Ikimina App',
        aboutUs: data.aboutUs || '',
        termsOfService: data.termsOfService || '',
        privacyPolicy: data.privacyPolicy || '',
        copyrightNotice: data.copyrightNotice || '',
        payoutCampaign: data.payoutCampaign || { status: 'closed' }
    };
});
/**
 * Admin Action: Opens an active member interest payout election campaign.
 * Broadcasts in-app for all members to elect whether to add profit to contributions or receive cash.
 */
exports.openInterestPayoutCampaign = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin privileges required.');
    }
    const { targetAmount, announcement } = request.data || {};
    const settingsRef = db.collection('settings').doc('financials');
    await settingsRef.set({
        payoutCampaign: {
            status: 'open',
            targetAmount: targetAmount ? Number(targetAmount) : null,
            announcement: announcement ? String(announcement).trim() : 'Annual / Periodic Profit Distribution is being prepared. Please elect your payout preference.',
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            openedBy: request.auth.uid
        }
    }, { merge: true });
    const logRef = db.collection('audit_logs').doc();
    await logRef.set({
        adminId: request.auth.uid,
        action: 'OPEN_INTEREST_PAYOUT_CAMPAIGN',
        justification: 'Opened member payout preference election window',
        details: { targetAmount, announcement },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});
/**
 * Admin Action: Closes an active interest payout campaign without executing distribution.
 */
exports.closeInterestPayoutCampaign = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin privileges required.');
    }
    const settingsRef = db.collection('settings').doc('financials');
    await settingsRef.set({
        payoutCampaign: {
            status: 'closed',
            closedAt: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });
    return { success: true };
});
/**
 * Member / Admin Action: Records a member's interest payout preference.
 * - 'add_to_contribution': Interest is capitalized directly into total verified savings.
 * - 'receive_payout': Interest is paid out as liquid accrued profit.
 */
exports.setMemberPayoutPreference = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const { preference, memberId } = request.data || {};
    if (preference !== 'add_to_contribution' && preference !== 'receive_payout') {
        throw new https_1.HttpsError('invalid-argument', 'Preference must be either "add_to_contribution" or "receive_payout".');
    }
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = callerSnap.data();
    // An admin can record the preference on behalf of any member; otherwise users can only update their own
    const targetUserId = ((callerData === null || callerData === void 0 ? void 0 : callerData.role) === 'admin' && memberId) ? memberId : request.auth.uid;
    await db.collection('users').doc(targetUserId).update({
        interestPayoutPreference: preference,
        interestPayoutPreferenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, preference, targetUserId };
});
//# sourceMappingURL=financial-management.js.map