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

// Backend 1. contribution-management.ts reviewer check
applyReplacements('functions/contribution-management.ts', [
  { from: /adminData\?\.role !== 'reviewer'/g, to: `adminData?.role !== 'reviewer' && adminData?.role !== 'senior_accountant'` }
]);

// Backend 2. user-management.ts reviewer check
applyReplacements('functions/user-management.ts', [
  { from: /memberData\.role !== 'reviewer'/g, to: `memberData.role !== 'reviewer' && memberData.role !== 'senior_accountant'` }
]);

// Backend 3. expense-management.ts? Let's assume it might use accountant.
applyReplacements('functions/expense-management.ts', [
  { from: /callerData\?\.role !== 'accountant'/g, to: `callerData?.role !== 'accountant' && callerData?.role !== 'senior_accountant'` }
]);

console.log('Added senior_accountant role backend checks');
