const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/admin/approvals/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

// Ensure reviewContributionAction and reviewLoanAction are imported
if (!code.includes('reviewLoanAction')) {
  code = code.replace(
    /verifyContributionAction,/,
    'verifyContributionAction, reviewContributionAction, reviewLoanAction,'
  );
}

// 1. Modify handleActionSlip
code = code.replace(
  `const handleActionSlip = async (decision: 'verify' | 'reject') => {`,
  `const handleActionSlip = async (decision: 'review' | 'verify' | 'reject') => {`
);
code = code.replace(
  `if (decision === 'verify') {
        await verifyContributionAction({`,
  `if (decision === 'review') {
        await reviewContributionAction({
          contributionId: inspectSlip.id,
          justification: slipJustification.trim()
        });
        toast({ title: "Deposit Reviewed", description: "Deposit slip has been reviewed successfully." });
      } else if (decision === 'verify') {
        await verifyContributionAction({`
);

// 2. Modify handleActionLoan
code = code.replace(
  `const handleActionLoan = async (decision: 'approve' | 'reject') => {`,
  `const handleActionLoan = async (decision: 'review' | 'approve' | 'reject') => {`
);
code = code.replace(
  `if (decision === 'approve') {
        await approveLoanAction({`,
  `if (decision === 'review') {
        await reviewLoanAction({
          loanId: inspectLoan.id,
          justification: loanJustification.trim()
        });
        toast({ title: "Loan Reviewed", description: "Loan request has been reviewed successfully." });
      } else if (decision === 'approve') {
        await approveLoanAction({`
);

// 3. Modify footer of isSlipModalOpen
code = code.replace(
  `            {!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleActionSlip('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                >
                  Reject
                </Button>
                <Button 
                  onClick={() => handleActionSlip('verify')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Verify & Credit
                </Button>
              </div>
            )}`,
  `            {!isSlipInitiatedByCurrentUser(inspectSlip) && (
              <div className="flex items-center gap-2">
                {(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionSlip('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                  >
                    Reject
                  </Button>
                )}
                {isReviewer && inspectSlip?.status === 'pending' && (
                  <Button 
                    onClick={() => handleActionSlip('review')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Review Deposit
                  </Button>
                )}
                {isSuperAdmin && inspectSlip?.status === 'reviewed' && (
                  <Button 
                    onClick={() => handleActionSlip('verify')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Approve Deposit
                  </Button>
                )}
              </div>
            )}`
);

// 4. Modify footer of isLoanModalOpen
code = code.replace(
  `            {!isLoanInitiatedByCurrentUser(inspectLoan) && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleActionLoan('reject')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                >
                  Reject
                </Button>
                <Button 
                  onClick={() => handleActionLoan('approve')} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Approve Loan
                </Button>
              </div>
            )}`,
  `            {!isLoanInitiatedByCurrentUser(inspectLoan) && (
              <div className="flex items-center gap-2">
                {(isReviewer || isSuperAdmin) && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleActionLoan('reject')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold border-destructive/30 text-destructive"
                  >
                    Reject
                  </Button>
                )}
                {isReviewer && inspectLoan?.status === 'requested' && (
                  <Button 
                    onClick={() => handleActionLoan('review')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Review Loan
                  </Button>
                )}
                {isSuperAdmin && inspectLoan?.status === 'reviewed' && (
                  <Button 
                    onClick={() => handleActionLoan('approve')} 
                    disabled={isSubmitting}
                    className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Approve Loan
                  </Button>
                )}
              </div>
            )}`
);

fs.writeFileSync(file, code);
console.log('Fixed dialog UI!');
