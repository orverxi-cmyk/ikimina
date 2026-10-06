const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/(app)/members/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  `const isAdmin = userData?.role === 'admin';`,
  `const isAdmin = userData?.role === 'admin';\n  const isReviewer = userData?.role === 'reviewer';`
);

code = code.replace(
  `{member.passwordSet && member.status === 'pending' && (`,
  `{isReviewer && member.passwordSet && member.status === 'pending' && (`
);

code = code.replace(
  `{member.passwordSet && member.status === 'reviewed' && (`,
  `{isAdmin && member.passwordSet && member.status === 'reviewed' && (`
);

code = code.replace(
  `(member.passwordSet && member.status === 'pending') ? (`,
  `(isReviewer && member.passwordSet && member.status === 'pending') ? (`
);

code = code.replace(
  `: (member.passwordSet && member.status === 'reviewed') ? (`,
  `: (isAdmin && member.passwordSet && member.status === 'reviewed') ? (`
);

fs.writeFileSync(file, code);
console.log('Done fixing members page frontend checks!');
