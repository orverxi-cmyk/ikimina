import * as admin from 'firebase-admin';

// Initialize the Admin SDK globally
if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Entry point for Firebase Cloud Functions.
 * Exports all modularized administrative and financial logic.
 */
export * from './user-management';
export * from './loan-management';
export * from './audit-management';
export * from './contribution-management';
export * from './financial-management';
export * from './expense-management';
