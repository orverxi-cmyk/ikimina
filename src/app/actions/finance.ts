'use server';

/**
 * @fileOverview Bridge actions to call secure Cloud Functions from the Next.js server context.
 * This maintains the unified UI while utilizing the robust Firebase Admin infrastructure.
 */

import { initializeFirebase } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

export async function registerMemberAction(adminId: string, memberData: any) {
    const { app } = initializeFirebase();
    const functions = getFunctions(app);
    const registerFn = httpsCallable(functions, 'registerMember');
    
    try {
        const result = await registerFn({ memberData, justification: memberData.justification });
        return result.data;
    } catch (error: any) {
        throw new Error(error.message);
    }
}

export async function logAdminAction(data: { adminId: string, action: string, justification: string, details?: any }) {
    const { app } = initializeFirebase();
    const functions = getFunctions(app);
    const logFn = httpsCallable(functions, 'logAdminAction');
    
    try {
        const result = await logFn(data);
        return result.data;
    } catch (error: any) {
        throw new Error(error.message);
    }
}

export async function bulkRegisterMembersAction(adminId: string, members: any[], justification: string) {
    // For bulk uploads, we can still use batch writes for efficiency, or call a dedicated cloud function
    // For simplicity and speed in this prototype, we'll iterate the registration function or use a batch logic
    const { firestore } = initializeFirebase();
    const { writeBatch, collection, doc, serverTimestamp } = await import('firebase/firestore');
    
    const batch = writeBatch(firestore);
    members.forEach(m => {
        const ref = doc(collection(firestore, 'users'));
        batch.set(ref, {
            ...m,
            joinedAt: serverTimestamp(),
            status: 'pending'
        });
    });
    
    await batch.commit();
    await logAdminAction({ adminId, action: 'BULK_UPLOAD_MEMBERS', justification, details: { count: members.length } });
    return { success: true };
}