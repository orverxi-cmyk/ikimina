const fs = require('fs');
const path = require('path');

const applyReplacements = (file, replacements) => {
  const filePath = path.join(__dirname, '../', file);
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf-8');
  for (const { from, to } of replacements) {
    code = code.replace(from, to);
  }
  fs.writeFileSync(filePath, code);
};

// 1. Sidebar
applyReplacements('src/components/layout/app-sidebar.tsx', [
  { from: `const isAccountant = role === 'accountant';`, to: `const isAccountant = role === 'accountant' || role === 'senior_accountant';` },
  { from: `const isReviewer = role === 'reviewer' || role === 'management';`, to: `const isReviewer = role === 'reviewer' || role === 'management' || role === 'senior_accountant';` }
]);

// 2. Admin Layout
applyReplacements('src/app/admin/layout.tsx', [
  { from: `const isAccountant = userRole === 'accountant';`, to: `const isAccountant = userRole === 'accountant' || userRole === 'senior_accountant';` },
  { from: `const isReviewer = userRole === 'reviewer' || userRole === 'management';`, to: `const isReviewer = userRole === 'reviewer' || userRole === 'management' || userRole === 'senior_accountant';` }
]);

// 3. Members Page
applyReplacements('src/app/(app)/members/page.tsx', [
  { from: `const isReviewer = userData?.role === 'reviewer';`, to: `const isReviewer = userData?.role === 'reviewer' || userData?.role === 'senior_accountant';` },
  { 
    from: `<SelectItem value="accountant">Accountant (Payroll &amp; Uploads)</SelectItem>`, 
    to: `<SelectItem value="senior_accountant">Senior Accountant (Initiator &amp; Reviewer)</SelectItem>\n                    <SelectItem value="accountant">Accountant (Payroll &amp; Uploads)</SelectItem>` 
  }
]);

// 4. More Page
applyReplacements('src/app/(app)/more/page.tsx', [
  { from: `role === 'accountant'`, to: `(role === 'accountant' || role === 'senior_accountant')` },
  { from: `role === 'reviewer'`, to: `(role === 'reviewer' || role === 'senior_accountant')` }
]);

// 5. Contributions Page
applyReplacements('src/app/(app)/contributions/page.tsx', [
  { from: `role === 'accountant';`, to: `role === 'accountant' || role === 'senior_accountant';` }
]);

// 6. Loans Page
applyReplacements('src/app/(app)/loans/page.tsx', [
  { from: `role === 'accountant';`, to: `role === 'accountant' || role === 'senior_accountant';` }
]);

// 7. Settings Page
applyReplacements('src/app/admin/settings/page.tsx', [
  { from: `userData?.role === 'accountant'`, to: `(userData?.role === 'accountant' || userData?.role === 'senior_accountant')` }
]);

// Backend 1. contribution-management.ts
applyReplacements('functions/contribution-management.ts', [
  { from: /adminData\?\.role !== 'accountant'/g, to: `adminData?.role !== 'accountant' && adminData?.role !== 'senior_accountant'` }
]);

// Backend 2. financial-management.ts
applyReplacements('functions/financial-management.ts', [
  { from: /callerData\?\.role !== 'accountant'/g, to: `callerData?.role !== 'accountant' && callerData?.role !== 'senior_accountant'` }
]);

console.log('Added senior_accountant role');
