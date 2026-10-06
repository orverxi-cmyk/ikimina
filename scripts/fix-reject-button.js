const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/admin/approvals/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

// For deposits
code = code.replace(
  `{(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionSlip('reject')}`,
  `{((isReviewer && inspectSlip?.status === 'pending') || (isSuperAdmin && inspectSlip?.status === 'reviewed')) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionSlip('reject')}`
);

// For loans
code = code.replace(
  `{(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionLoan('reject')}`,
  `{((isReviewer && inspectLoan?.status === 'requested') || (isSuperAdmin && inspectLoan?.status === 'reviewed')) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionLoan('reject')}`
);

fs.writeFileSync(file, code);
console.log('Fixed reject button visibility!');
