const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/(app)/members/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

// 1. Update the query check
code = code.replace(
  `  const membersQuery = useMemoFirebase(() => {
    if (!isAdmin) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [isAdmin]);`,
  `  const membersQuery = useMemoFirebase(() => {
    if (!isAdmin && !isReviewer) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [isAdmin, isReviewer]);`
);

// 2. Update the loading check
code = code.replace(
  `  if (userLoading || (isAdmin && membersLoading)) {`,
  `  if (userLoading || ((isAdmin || isReviewer) && membersLoading)) {`
);

// 3. Update the access denied view
code = code.replace(
  `  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can manage system roles.</p>
      </div>
    );
  }`,
  `  if (!isAdmin && !isReviewer) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can manage system roles.</p>
      </div>
    );
  }`
);

fs.writeFileSync(file, code);
console.log('Fixed reviewer access to the members page content!');
