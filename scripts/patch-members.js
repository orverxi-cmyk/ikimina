const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/(app)/members/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /adminActivateMemberAction,/,
  'adminActivateMemberAction, reviewMemberAction,'
);

const handleReviewMemberStr = `
  const handleReviewMember = async (targetMember: any) => {
    setActivatingMemberId(targetMember.id);
    try {
      await reviewMemberAction({
        memberId: targetMember.id,
        justification: 'Reviewed member profile and verified details'
      });
      toast({
        title: 'Member Reviewed',
        description: targetMember.name + ' has been reviewed successfully. Awaiting admin activation.'
      });
    } catch (e: any) {
      const error = parseAppError(e);
      toast({ variant: 'destructive', title: error.title, description: error.message });
    } finally {
      setActivatingMemberId(null);
    }
  };
`;

code = code.replace(/const handleActivateMember = async \\(targetMember: any\\) => \\{/, handleReviewMemberStr + '\\n  const handleActivateMember = async (targetMember: any) => {');

// In members/page.tsx, we have a table and dropdown.
code = code.replace(
  /\\{member.passwordSet && \\(\\s*<Button\\s*size="sm"\\s*onClick=\\{\\(\\) => handleActivateMember\\(member\\)\\}[\\s\\S]*?<UserCheck className="h-3 w-3" \\/>\\s*\\)\\}\\s*Activate\\s*<\\/Button>\\s*\\)\\}/,
  `{member.passwordSet && member.status === 'pending' && (
                              <Button 
                                size="sm" 
                                onClick={() => handleReviewMember(member)}
                                disabled={activatingMemberId === member.id}
                                className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1"
                              >
                                {activatingMemberId === member.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                Review
                              </Button>
                            )}
                            {member.passwordSet && member.status === 'reviewed' && (
                              <Button 
                                size="sm" 
                                onClick={() => handleActivateMember(member)}
                                disabled={activatingMemberId === member.id}
                                className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1"
                              >
                                {activatingMemberId === member.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                                Activate
                              </Button>
                            )}`
);

code = code.replace(
  /member.passwordSet && \\(\\s*<DropdownMenuItem\\s*className="font-bold text-emerald-600[\\s\\S]*?onClick=\\{\\(\\) => handleActivateMember\\(member\\)\\}[\\s\\S]*?Activate Membership\\s*<\\/DropdownMenuItem>\\s*\\)/,
  `(member.passwordSet && member.status === 'pending') ? (
                              <DropdownMenuItem 
                                className="font-bold text-blue-600 flex items-center gap-1.5 focus:text-blue-600 focus:bg-blue-50 dark:focus:bg-blue-950/20 cursor-pointer" 
                                onClick={() => handleReviewMember(member)}
                                disabled={activatingMemberId === member.id}
                              >
                                <Eye className="h-4 w-4" /> Review Membership
                              </DropdownMenuItem>
                            ) : (member.passwordSet && member.status === 'reviewed') ? (
                              <DropdownMenuItem 
                                className="font-bold text-emerald-600 flex items-center gap-1.5 focus:text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/20 cursor-pointer" 
                                onClick={() => handleActivateMember(member)}
                                disabled={activatingMemberId === member.id}
                              >
                                <UserCheck className="h-4 w-4" /> Activate Membership
                              </DropdownMenuItem>
                            ) : null`
);

// add Eye icon to imports
code = code.replace(/UserCheck,/, 'UserCheck, Eye,');

fs.writeFileSync(file, code);
console.log('Patched members page!');
