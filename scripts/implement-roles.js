const fs = require('fs');
const path = require('path');

const funcDir = path.join(__dirname, '../functions');

// 1. user-management.ts
let userMgmt = fs.readFileSync(path.join(funcDir, 'user-management.ts'), 'utf-8');

// Modify adminActivateMember
userMgmt = userMgmt.replace(
  `if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can activate member accounts.');
    }`,
  `if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only administrators can activate member accounts.');
    }`
); // wait, let's use regex instead

userMgmt = userMgmt.replace(
  `    const memberData = memberSnap.data()!;

    if (!memberData.passwordSet) {`,
  `    const memberData = memberSnap.data()!;

    if (memberData.status !== 'reviewed') {
        throw new HttpsError('failed-precondition', 'Member account must be reviewed by a reviewer before admin activation. Current status: ' + memberData.status);
    }

    if (!memberData.passwordSet) {`
);

const reviewMemberCode = `
export const reviewMember = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review member accounts.');
    }

    const { memberId, justification } = request.data || {};
    if (!memberId) throw new HttpsError('invalid-argument', 'Member ID is required.');

    const memberRef = db.collection('users').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
        throw new HttpsError('not-found', 'Member profile not found.');
    }

    const memberData = memberSnap.data()!;
    if (memberData.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Cannot review a member not in pending status.');
    }

    await memberRef.update({
        status: 'reviewed',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: request.auth.uid
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_MEMBER',
        justification: justification || 'Reviewed member profile',
        details: { memberId, memberName: memberData.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, memberId, status: 'reviewed' };
});
`;
userMgmt += "\n" + reviewMemberCode;
fs.writeFileSync(path.join(funcDir, 'user-management.ts'), userMgmt);

// 2. contribution-management.ts
let contribMgmt = fs.readFileSync(path.join(funcDir, 'contribution-management.ts'), 'utf-8');
contribMgmt = contribMgmt.replace(
  `    if (adminData?.role !== 'admin' && adminData?.role !== 'management' && adminData?.role !== 'accountant') {
        throw new HttpsError('permission-denied', 'Only authorized personnel can verify contributions.');
    }`,
  `    if (adminData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admin can verify contributions.');
    }`
);
contribMgmt = contribMgmt.replace(
  `        const contribData = contribSnap.data()!;
        if (contribData.memberId === request.auth.uid || contribData.recordedBy === request.auth.uid) {`,
  `        const contribData = contribSnap.data()!;
        if (contribData.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', 'Cannot approve. Contribution must be reviewed first. (Current status: ' + contribData.status + ')');
        }
        if (contribData.memberId === request.auth.uid || contribData.recordedBy === request.auth.uid) {`
);

const reviewContribCode = `
export const reviewContribution = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review contributions.');
    }

    const { contributionId, justification } = request.data;
    if (!contributionId) throw new HttpsError('invalid-argument', 'Contribution ID is required.');

    const contributionRef = db.collection('contributions').doc(contributionId);
    const contribSnap = await contributionRef.get();
    if (!contribSnap.exists) throw new HttpsError('not-found', 'Contribution not found.');
    
    const contribData = contribSnap.data()!;
    if (contribData.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Contribution is currently in ' + contribData.status + ' status, cannot be reviewed.');
    }

    await contributionRef.update({
        status: 'reviewed',
        reviewedBy: request.auth.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewJustification: justification || 'Reviewed'
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_CONTRIBUTION',
        justification: justification || 'Reviewed',
        details: { contributionId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
`;
contribMgmt += "\n" + reviewContribCode;
fs.writeFileSync(path.join(funcDir, 'contribution-management.ts'), contribMgmt);


// 3. loan-management.ts
let loanMgmt = fs.readFileSync(path.join(funcDir, 'loan-management.ts'), 'utf-8');
loanMgmt = loanMgmt.replace(
  `    if (userData?.role !== 'admin' && userData?.role !== 'management') {
        throw new HttpsError('permission-denied', 'Management authority required.');
    }`,
  `    if (userData?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admin can approve loans.');
    }`
);
loanMgmt = loanMgmt.replace(
  `        if (loanData.status !== 'requested') {
            throw new HttpsError('failed-precondition', \`Loan is currently in '\${loanData.status}' status, cannot be approved.\`);
        }`,
  `        if (loanData.status !== 'reviewed') {
            throw new HttpsError('failed-precondition', \`Loan must be reviewed by a reviewer before approval. Current status: \${loanData.status}\`);
        }`
);

const reviewLoanCode = `
export const reviewLoan = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
    
    const db = admin.firestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.data()?.role;

    if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review loans.');
    }

    const { loanId, justification } = request.data;
    if (!loanId) throw new HttpsError('invalid-argument', 'Loan ID is required.');

    const loanRef = db.collection('loans').doc(loanId);
    const loanSnap = await loanRef.get();
    if (!loanSnap.exists) throw new HttpsError('not-found', 'Loan not found.');
    
    const loanData = loanSnap.data()!;
    if (loanData.status !== 'requested') {
        throw new HttpsError('failed-precondition', 'Loan is currently in ' + loanData.status + ' status, cannot be reviewed.');
    }

    await loanRef.update({
        status: 'reviewed',
        reviewedBy: request.auth.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewJustification: justification || 'Reviewed'
    });

    await db.collection('audit_logs').add({
        adminId: request.auth.uid,
        action: 'REVIEW_LOAN',
        justification: justification || 'Reviewed loan request',
        details: { loanId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
`;
loanMgmt += "\n" + reviewLoanCode;
fs.writeFileSync(path.join(funcDir, 'loan-management.ts'), loanMgmt);

console.log('Done patching backend!');
