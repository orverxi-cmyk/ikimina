const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/admin/approvals/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

// For deposits
code = code.replace(
  `{!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification *</Label>`,
  `{!isSlipInitiatedByCurrentUser(inspectSlip) && ((isReviewer && inspectSlip?.status === 'pending') || (isSuperAdmin && inspectSlip?.status === 'reviewed')) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification *</Label>`
);

// For loans
code = code.replace(
  `{!isLoanInitiatedByCurrentUser(inspectLoan) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Approval / Audit Justification *</Label>`,
  `{!isLoanInitiatedByCurrentUser(inspectLoan) && ((isReviewer && inspectLoan?.status === 'requested') || (isSuperAdmin && inspectLoan?.status === 'reviewed')) && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Approval / Audit Justification *</Label>`
);

fs.writeFileSync(file, code);
console.log('Fixed justification field visibility!');
