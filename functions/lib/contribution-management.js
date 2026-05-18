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
exports.recordContribution = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
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
//# sourceMappingURL=contribution-management.js.map