
'use server';

/**
 * @fileOverview Secure server-side actions for financial and administrative operations.
 * These functions run on the Node.js 22 server environment.
 */

import { initializeFirebase } from '@/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch,
  increment,
  Timestamp,
  getDoc
} from 'firebase/firestore';

/**
 * Internal helper to verify if a user has admin privileges.
 * This runs on the server and is used to protect sensitive actions.
 */
async function verifyAdmin(userId: string) {
  const { firestore } = initializeFirebase();
  const userSnap = await getDoc(doc(firestore, 'users', userId));
  if (!userSnap.exists() || userSnap.data().role !== 'admin') {
    throw new Error('Permission denied: You must be an administrator.');
  }
  return userSnap.data();
}

/**
 * Logs an administrative action for audit purposes.
 */
export async function logAdminAction(data: {
  adminId: string;
  action: string;
  justification: string;
  details?: any;
}) {
  const { firestore } = initializeFirebase();
  
  // Verify admin status before logging
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
    throw new Error('Failed to create audit log entry.');
  }
}

/**
 * Registers a new member with a pending status.
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
    
    // Log the administrative action
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
 * Processes a bulk upload of members.
 */
export async function bulkRegisterMembersAction(adminId: string, members: any[], justification: string) {
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
