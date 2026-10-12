import * as admin from 'firebase-admin';

export interface NotificationPayload {
    recipientId?: string | null;
    recipientRole?: 'admin' | 'senior_accountant' | 'reviewer' | 'accountant' | 'auditor' | 'member' | null;
    title: string;
    message: string;
    type?: 'loan' | 'contribution' | 'expense' | 'interest' | 'payout' | 'system' | 'account';
    severity?: 'info' | 'success' | 'warning' | 'destructive';
    actionUrl?: string;
    metadata?: Record<string, any>;
}

/**
 * Creates an authoritative in-app notification in the Firestore 'notifications' collection.
 */
export async function createNotification(
    db: admin.firestore.Firestore,
    payload: NotificationPayload
): Promise<string> {
    try {
        if (payload.recipientRole && !payload.recipientId) {
            await notifyRoles(db, [payload.recipientRole as any], payload);
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
    } catch (e) {
        console.warn('Failed to dispatch notification:', e);
        return '';
    }
}

/**
 * Dispatches notifications across multiple staff roles simultaneously,
 * delivering an individual notification record to each user possessing the specified roles.
 */
export async function notifyRoles(
    db: admin.firestore.Firestore,
    roles: Array<'admin' | 'senior_accountant' | 'reviewer' | 'accountant' | 'auditor'>,
    payload: Omit<NotificationPayload, 'recipientRole' | 'recipientId'>
): Promise<void> {
    try {
        const usersSnap = await db.collection('users')
            .where('role', 'in', roles)
            .get();

        const recipientUserIds = new Set<string>();
        usersSnap.forEach(doc => recipientUserIds.add(doc.id));

        if (roles.includes('admin')) {
            const adminByEmailSnap = await db.collection('users')
                .where('email', '==', 'tharushyamagara@gmail.com')
                .limit(1)
                .get();
            adminByEmailSnap.forEach(doc => recipientUserIds.add(doc.id));
        }

        const promises = Array.from(recipientUserIds).map(userId => 
            createNotification(db, { ...payload, recipientId: userId })
        );
        await Promise.all(promises);
    } catch (e) {
        console.warn('Failed to dispatch notifications to roles:', e);
    }
}
