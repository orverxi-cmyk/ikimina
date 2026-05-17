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
exports.logAdminAction = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * General purpose secure logging for any administrative action.
 */
exports.logAdminAction = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin' && ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'management') {
        throw new https_1.HttpsError('permission-denied', 'Administrative access required for logging.');
    }
    const { action, justification, details } = request.data;
    try {
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action,
            justification,
            details: details || {},
            ipAddress: request.rawRequest.ip || 'internal',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', 'Audit logging failed.');
    }
});
//# sourceMappingURL=audit-management.js.map