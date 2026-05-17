
'use server';

/**
 * @fileOverview Secure server-side actions for financial and administrative operations.
 * These functions run on the Node.js 22 server environment (Google Cloud Run).
 * Verification and audit logging are performed here to ensure high confidentiality.
 */

import { initializeFirebase } from '@/firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDoc,
  serverTimestamp, 
  writeBatch
} from 'firebase/firestore';

/**
 * Verifies if the calling user has administrative privileges.
 * This is the server-side gatekeeper for all sensitive operations.
 */
async function verifyAdmin(adminId: string) {
  const { firestore } = initializeFirebase();
  const userSnap = await getDoc(doc(firestore, 'users', adminId));
  
  if (!userSnap.exists() || userSnap.data().role !== 'admin') {
    throw new Error('SECURE_AUTH_ERROR: Permission denied. Unauthorized administrative attempt.');
  }
  return userSnap.data();
}

/**
 * Logs an administrative action for audit purposes.
 * This is equivalent to a secure Cloud Function logic.
 */
export async function logAdminAction(data: {
  adminId: string;
  action: string;
  justification: string;
  details?: any;
}) {
  const { firestore } = initializeFirebase();
  
  // 1. Authentication & Authorization check on server
  await verifyAdmin(data.adminId);

  const logData = {
    adminId: data.adminId,
    action: data.action,
    justification: data.justification,
    details: data.details || {},
    timestamp: serverTimestamp(),
  };

  try {
    await addDoc(collection(firestore, 'audit_logs'), logData);
    return { success: true };
  } catch (error: any) {
    throw new Error('INTERNAL_LOG_ERROR: Failed to record audit log.');
  }
}

/**
 * Securely registers a new member.
 * Only callable by verified admins.
 */
export async function registerMemberAction(
  adminId: string,
  memberData: {
    firstName: string;
    surname: string;
    email: string;
    phone: string;
    role: string;
    justification: string;
  }
) {
  const { firestore } = initializeFirebase();
  await verifyAdmin(adminId);

  const name = `${memberData.firstName} ${memberData.surname}`.trim();
  
  const newMember = {
    name,
    email: memberData.email.toLowerCase(),
    phone: memberData.phone || '',
    role: memberData.role,
    joinedAt: serverTimestamp(),
    status: 'pending',
  };

  try {
    const docRef = await addDoc(collection(firestore, 'users'), newMember);
    
    // Auto-log the action on the server
    await logAdminAction({
      adminId,
      action: 'REGISTER_MEMBER',
      justification: memberData.justification,
      details: { memberEmail: memberData.email, memberId: docRef.id }
    });

    return { success: true, id: docRef.id };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to register member');
  }
}

/**
 * Securely processes bulk member registration.
 */
export async function bulkRegisterMembersAction(
  adminId: string, 
  members: any[], 
  justification: string
) {
  const { firestore } = initializeFirebase();
  await verifyAdmin(adminId);
  
  const batch = writeBatch(firestore);

  try {
    members.forEach(m => {
      const newDocRef = doc(collection(firestore, 'users'));
      batch.set(newDocRef, {
        name: m.name,
        email: m.email.toLowerCase(),
        phone: m.phone || '',
        role: m.role || 'member',
        joinedAt: serverTimestamp(),
        status: 'pending',
      });
    });

    await batch.commit();

    await logAdminAction({
      adminId,
      action: 'BULK_REGISTER_MEMBERS',
      justification,
      details: { count: members.length }
    });

    return { success: true, count: members.length };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to process bulk upload');
  }
}
