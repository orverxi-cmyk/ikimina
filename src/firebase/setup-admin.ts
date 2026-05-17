
'use client';

import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';

/**
 * UTILITY SCRIPT: Bootstrapping an Admin
 * 
 * To use this:
 * 1. Import it in a temporary component or layout.
 * 2. Call `bootstrapAdmin(db, "user-uid-here", "admin")`.
 * 3. Or use the Firebase Console to manually set the `role` field on a user document to "admin".
 */

export async function bootstrapAdmin(db: Firestore, userId: string, role: 'admin' | 'management' | 'member' = 'admin') {
  const userRef = doc(db, 'users', userId);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      await updateDoc(userRef, { role });
      console.log(`User ${userId} promoted to ${role}`);
    } else {
      console.error("User document does not exist yet. Ensure the user has logged in/activated first.");
    }
  } catch (error) {
    console.error("Error bootstrapping admin:", error);
  }
}
