const fs = require('fs');
const path = require('path');

const clientPath = path.join(__dirname, '../src/lib/finance-client.ts');
let client = fs.readFileSync(clientPath, 'utf-8');

const newClientStubs = `
export async function reviewMemberAction(data: { memberId: string; justification?: string }) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'reviewMember');
  try {
    const result = await fn(data);
    return result.data as { success: boolean; memberId: string; status: string; };
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to review member account');
  }
}

export async function reviewContributionAction(data: { contributionId: string; justification: string }) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'reviewContribution');
  try {
    const result = await fn(data);
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to review contribution');
  }
}

export async function reviewLoanAction(data: { loanId: string; justification?: string }) {
  const functions = getFinanceFunctions();
  const fn = httpsCallable(functions, 'reviewLoan');
  try {
    const result = await fn(data);
    return result.data;
  } catch (error: any) {
    throw formatFinanceActionError(error, 'Failed to review loan');
  }
}
`;

client += "\n" + newClientStubs;
fs.writeFileSync(clientPath, client);

console.log('Done patching frontend client!');
