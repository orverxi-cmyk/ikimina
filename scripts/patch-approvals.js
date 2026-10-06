
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/admin/approvals/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  /verifyContributionAction,/,
  'verifyContributionAction, reviewContributionAction, reviewLoanAction,'
);

const handleReviewContr = `
  const handleReviewContribution = async (contribution: any) => {
    if (!justification.trim()) {
      return toast({ variant: "destructive", title: "Error", description: "Audit justification is required to review." });
    }
    setProcessingId(contribution.id);
    try {
      await reviewContributionAction({ contributionId: contribution.id, justification });
      toast({ title: "Reviewed", description: "Deposit has been reviewed successfully." });
      setJustification('');
      setIsInspectOpen(false);
      setInspectTarget(null);
    } catch (e: any) {
      const err = parseAppError(e);
      toast({ variant: "destructive", title: err.title, description: err.message });
    } finally {
      setProcessingId(null);
    }
  };
`;
code = code.replace(/const handleVerifyContribution = async \(contribution: any\) => \{/, handleReviewContr + '\n  const handleVerifyContribution = async (contribution: any) => {');

const handleReviewLn = `
  const handleReviewLoan = async (loan: any) => {
    if (!justification.trim()) {
      return toast({ variant: "destructive", title: "Error", description: "Audit justification is required to review." });
    }
    setProcessingId(loan.id);
    try {
      await reviewLoanAction({ loanId: loan.id, justification });
      toast({ title: "Reviewed", description: "Loan has been reviewed successfully." });
      setJustification('');
      setIsInspectOpen(false);
      setInspectTarget(null);
    } catch (e: any) {
      const err = parseAppError(e);
      toast({ variant: "destructive", title: err.title, description: err.message });
    } finally {
      setProcessingId(null);
    }
  };
`;
code = code.replace(/const handleApproveLoan = async \(loan: any\) => \{/, handleReviewLn + '\n  const handleApproveLoan = async (loan: any) => {');

// For deposits
code = code.replace(
  /{isSuperAdmin && \(\s*<Button\s*onClick=\{\(\) => handleVerifyContribution\(inspectTarget\)\}[^>]*>\s*\{[^}]*\}\s*<CheckCircle2[^>]*>\s*Verify Deposit\s*<\/Button>\s*\)}/g,
  `
  {isReviewer && inspectTarget.status === 'pending' && (
    <Button onClick={() => handleReviewContribution(inspectTarget)} disabled={processingId === inspectTarget.id} className="font-bold flex-1 bg-blue-600 hover:bg-blue-700">
      {processingId === inspectTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
      Review Deposit
    </Button>
  )}
  {isSuperAdmin && inspectTarget.status === 'reviewed' && (
    <Button onClick={() => handleVerifyContribution(inspectTarget)} disabled={processingId === inspectTarget.id} className="font-bold flex-1 bg-emerald-600 hover:bg-emerald-700">
      {processingId === inspectTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
      Approve Deposit
    </Button>
  )}
  `
);

// For loans
code = code.replace(
  /{isSuperAdmin && \(\s*<Button\s*onClick=\{\(\) => handleApproveLoan\(inspectTarget\)\}[^>]*>\s*\{[^}]*\}\s*<CheckCircle2[^>]*>\s*Approve Loan\s*<\/Button>\s*\)}/g,
  `
  {isReviewer && inspectTarget.status === 'requested' && (
    <Button onClick={() => handleReviewLoan(inspectTarget)} disabled={processingId === inspectTarget.id} className="font-bold flex-1 bg-blue-600 hover:bg-blue-700 text-white">
      {processingId === inspectTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
      Review Loan
    </Button>
  )}
  {isSuperAdmin && inspectTarget.status === 'reviewed' && (
    <Button onClick={() => handleApproveLoan(inspectTarget)} disabled={processingId === inspectTarget.id} className="font-bold flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
      {processingId === inspectTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
      Approve Loan
    </Button>
  )}
  `
);

fs.writeFileSync(file, code);
console.log('Patched approvals page!');
