/**
 * Default legal & informational copy. Used whenever an administrator has not
 * supplied custom text in Admin → Settings → Identity. All text is parameterised
 * by the configurable application name so nothing is hard-coded to a brand.
 */

export const DEFAULT_APP_NAME = 'Ikimina App';

export function getDefaultAbout(appName: string = DEFAULT_APP_NAME): string {
  return `${appName} is a member-owned savings and credit platform. Members pool regular contributions into a common fund, and that fund is used to extend fair, affordable loans to members of the group.

Our principles
• Transparency – every contribution, loan, repayment, expense and dividend is recorded in an auditable ledger that members can review.
• Fairness – borrowing capacity and profit shares are calculated by clear rules that apply equally to every member.
• Accountability – administrative actions are logged with a justification and cannot be silently altered.
• Collective growth – interest earned on loans is returned to members as dividends, either paid out or reinvested into their savings.

Questions about the scheme can be raised with your group administrators.`;
}

export function getDefaultTerms(appName: string = DEFAULT_APP_NAME): string {
  return `These Terms of Service govern your participation in ${appName}. By signing in and using the platform you confirm that you have read, understood and agreed to them.

1. Membership
You must be a registered member of the group to use the platform. Your account is personal – keep your credentials confidential and do not allow anyone else to use them. You are responsible for all activity carried out under your account.

2. Contributions
Members agree to make contributions in the amount and at the frequency set by the group. A contribution only counts towards your savings once it has been submitted with valid proof of payment and verified by an administrator. Contributions that cannot be verified may be rejected.

3. Loans
Loan eligibility and the maximum amount you may borrow are determined by your verified savings and the lending limits configured by the group. Applications are subject to approval. The interest rate, interest model and repayment schedule shown at the time of approval are binding for that loan. Approved loans must be repaid according to the agreed schedule.

4. Late payments and penalties
Instalments that are not paid by their due date may attract the late-payment penalty configured by the group. Unresolved arrears may affect your eligibility for future loans and may be recovered from your savings and accrued interest in accordance with group rules.

5. Interest and dividends
Interest earned on loans forms the group's profit pool. Administrators may distribute this pool among members in proportion to their verified savings. When a distribution is announced, you may choose to add your share to your savings or to receive it as a cash payout. If no choice is made, your most recent saved preference applies. Distributions are final once executed.

6. Records and audit
All financial transactions and administrative actions are recorded in a permanent audit trail. These records are the authoritative source for balances and disputes.

7. Accuracy of information
You agree to provide accurate information and genuine proof of payment. Submitting false or altered documents may result in rejection of the transaction, suspension of your account and referral to the group's governing body.

8. Withdrawal and exit
Leaving the group, and the release of your savings and accrued interest, is subject to the group's rules and to settlement of any outstanding loans.

9. Availability
We aim to keep the platform available and accurate, but access may occasionally be interrupted for maintenance or reasons outside our control. We are not liable for losses resulting from such interruptions.

10. Changes to these terms
These terms may be updated from time to time. Continued use of the platform after an update means you accept the revised terms.

11. Disputes
Disagreements about balances, loans or distributions should first be raised with the group administrators, who will review them against the audit records.`;
}

export function getDefaultPrivacy(appName: string = DEFAULT_APP_NAME): string {
  return `This Privacy Policy explains how ${appName} collects, uses and protects your personal information.

1. Information we collect
• Identity and contact details: name, email address and phone number.
• Financial records: contributions, loans, repayments, interest balances, dividend elections and related proof-of-payment documents you upload.
• Technical information: basic sign-in and activity data needed to keep the platform secure.

2. How we use your information
• To operate your account and maintain the group's financial ledger.
• To verify contributions, assess and administer loans, and calculate dividends.
• To communicate with you about your account and group activity.
• To keep an audit trail and to detect and prevent fraud or misuse.

3. Who can see your information
Your personal and financial details are visible to you and to authorised administrators who need them to run the scheme. Other members cannot see your individual balances or loan details. We do not sell your information or share it with third parties for marketing.

4. Security
Data is stored on secure cloud infrastructure with access controls and encrypted connections. Administrative actions are logged. No system can be guaranteed completely secure, so please protect your password and sign out on shared devices.

5. Retention
Financial records are retained for as long as needed to maintain an accurate ledger, meet the group's accounting needs and resolve disputes, and for any period required by applicable law.

6. Your rights
You may ask an administrator to view or correct the personal information held about you. Requests to delete information are subject to the group's obligation to retain accurate financial records.

7. Uploaded documents
Proof-of-payment files you upload are stored securely and are accessible only to you and authorised administrators for verification and audit purposes.

8. Changes to this policy
We may update this policy from time to time. The latest version is always available from the footer of the platform.

9. Contact
For privacy questions or requests, please contact your group administrators.`;
}
