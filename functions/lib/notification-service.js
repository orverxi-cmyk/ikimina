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
exports.createNotification = createNotification;
exports.notifyRoles = notifyRoles;
const admin = __importStar(require("firebase-admin"));
/**
 * Creates an authoritative in-app notification in the Firestore 'notifications' collection.
 */
async function createNotification(db, payload) {
    try {
        if (payload.recipientRole && !payload.recipientId) {
            await notifyRoles(db, [payload.recipientRole], payload);
            return '';
        }
        const notifRef = db.collection('notifications').doc();
        await notifRef.set({
            recipientId: payload.recipientId || null,
            recipientRole: payload.recipientRole || null,
            title: payload.title.trim(),
            message: payload.message.trim(),
            type: payload.type || 'system',
            severity: payload.severity || 'info',
            actionUrl: payload.actionUrl || '/messages',
            metadata: payload.metadata || {},
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return notifRef.id;
    }
    catch (e) {
        console.warn('Failed to dispatch notification:', e);
        return '';
    }
}
/**
 * Dispatches notifications across multiple staff roles simultaneously,
 * delivering an individual notification record to each user possessing the specified roles.
 */
async function notifyRoles(db, roles, payload) {
    try {
        const usersSnap = await db.collection('users')
            .where('role', 'in', roles)
            .get();
        const recipientUserIds = new Set();
        usersSnap.forEach(doc => recipientUserIds.add(doc.id));
        if (roles.includes('admin')) {
            const adminByEmailSnap = await db.collection('users')
                .where('email', '==', 'tharushyamagara@gmail.com')
                .limit(1)
                .get();
            adminByEmailSnap.forEach(doc => recipientUserIds.add(doc.id));
        }
        const promises = Array.from(recipientUserIds).map(userId => createNotification(db, Object.assign(Object.assign({}, payload), { recipientId: userId })));
        await Promise.all(promises);
    }
    catch (e) {
        console.warn('Failed to dispatch notifications to roles:', e);
    }
}
//# sourceMappingURL=notification-service.js.map