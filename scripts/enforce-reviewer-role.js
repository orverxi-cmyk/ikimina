const fs = require('fs');
const path = require('path');

// 1. Update frontend (admin/approvals/page.tsx)
const approvalsFile = path.join(__dirname, '../src/app/admin/approvals/page.tsx');
let approvalsCode = fs.readFileSync(approvalsFile, 'utf-8');
approvalsCode = approvalsCode.replace(
  `const isReviewer = userRole === 'reviewer' || userRole === 'management' || userRole === 'admin';`,
  `const isReviewer = userRole === 'reviewer';`
);
fs.writeFileSync(approvalsFile, approvalsCode);

// 2. Update backend (user-management.ts)
const userMgmtFile = path.join(__dirname, '../functions/user-management.ts');
let userMgmtCode = fs.readFileSync(userMgmtFile, 'utf-8');
userMgmtCode = userMgmtCode.replace(
  `if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review member accounts.');
    }`,
  `if (callerRole !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Only users with the reviewer role can review member accounts.');
    }`
);
fs.writeFileSync(userMgmtFile, userMgmtCode);

// 3. Update backend (contribution-management.ts)
const contribMgmtFile = path.join(__dirname, '../functions/contribution-management.ts');
let contribMgmtCode = fs.readFileSync(contribMgmtFile, 'utf-8');
contribMgmtCode = contribMgmtCode.replace(
  `if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review contributions.');
    }`,
  `if (callerRole !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Only users with the reviewer role can review contributions.');
    }`
);
fs.writeFileSync(contribMgmtFile, contribMgmtCode);

// 4. Update backend (loan-management.ts)
const loanMgmtFile = path.join(__dirname, '../functions/loan-management.ts');
let loanMgmtCode = fs.readFileSync(loanMgmtFile, 'utf-8');
loanMgmtCode = loanMgmtCode.replace(
  `if (callerRole !== 'reviewer' && callerRole !== 'admin' && callerRole !== 'management') {
        throw new HttpsError('permission-denied', 'Only reviewers can review loans.');
    }`,
  `if (callerRole !== 'reviewer') {
        throw new HttpsError('permission-denied', 'Only users with the reviewer role can review loans.');
    }`
);
fs.writeFileSync(loanMgmtFile, loanMgmtCode);

console.log('Done enforcing strict reviewer role');
