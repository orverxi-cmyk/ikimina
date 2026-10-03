'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { 
  ShieldCheck, 
  Loader2, 
  Save, 
  Percent, 
  Wallet, 
  Info, 
  Globe, 
  Scale, 
  AlertTriangle,
  Trash2,
  AlertOctagon,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Landmark,
  CreditCard
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { updateFinancialSettingsAction, resetFinancialDataAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings, loading: settingsLoading, refreshSettings } = useSettings();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('RWF');
  const [interestModel, setInterestModel] = useState<string>('one-off');
  const [interestType, setInterestType] = useState<string>('immediate');
  const [depositBankName, setDepositBankName] = useState<string>('');
  const [depositAccountNumber, setDepositAccountNumber] = useState<string>('');
  const [infrastructureBranding, setInfrastructureBranding] = useState<string>('Secure Infrastructure Provided by ORVEXI');

  // Super Admin Reset State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetJustification, setResetJustification] = useState('');

  useEffect(() => {
    if (settings) {
      if (settings.currency) setSelectedCurrency(settings.currency);
      if (settings.interestModel) setInterestModel(settings.interestModel);
      if (settings.interestType) setInterestType(settings.interestType);
      if (settings.depositBankName !== undefined) setDepositBankName(settings.depositBankName);
      if (settings.depositAccountNumber !== undefined) setDepositAccountNumber(settings.depositAccountNumber);
      if (settings.infrastructureBranding !== undefined) setInfrastructureBranding(settings.infrastructureBranding);
    }
  }, [settings]);

  const isAdmin = userData?.role === 'admin';
  const isSuperAdmin = userData?.isSuperAdmin === true || user?.email === 'tharushyamagara@gmail.com';

  const handleUpdateSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsUpdating(true);
    const formData = new FormData(e.currentTarget);
    const loanInterestRate = Number(formData.get('loanInterestRate'));
    const contributionInterestRate = Number(formData.get('contributionInterestRate'));
    const maxLoanPercentage = Number(formData.get('maxLoanPercentage'));
    const maxLendingPoolPercentage = Number(formData.get('maxLendingPoolPercentage')) || 90;
    const minLoanAmount = Number(formData.get('minLoanAmount'));
    const penaltyRate = Number(formData.get('penaltyRate'));
    const depositBankNameVal = (formData.get('depositBankName') as string)?.trim() ?? depositBankName;
    const depositAccountNumberVal = (formData.get('depositAccountNumber') as string)?.trim() ?? depositAccountNumber;
    const infrastructureBrandingVal = (formData.get('infrastructureBranding') as string)?.trim() || infrastructureBranding;
    const justification = formData.get('justification') as string;

    try {
      await updateFinancialSettingsAction({ 
        currency: selectedCurrency,
        loanInterestRate, 
        interestModel,
        interestType,
        contributionInterestRate, 
        maxLoanPercentage, 
        maxLendingPoolPercentage,
        minLoanAmount, 
        penaltyRate,
        depositBankName: depositBankNameVal,
        depositAccountNumber: depositAccountNumberVal,
        infrastructureBranding: infrastructureBrandingVal,
        justification 
      });
      await refreshSettings();
      toast({ title: "Settings Updated", description: "Global financial policies updated successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetFinancialData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Only Super Administrators can perform this action." });
      return;
    }

    if (resetConfirmationText.trim() !== 'RESET FINANCIAL DATA') {
      toast({ 
        variant: "destructive", 
        title: "Confirmation Required", 
        description: 'Please type "RESET FINANCIAL DATA" exactly to confirm.' 
      });
      return;
    }

    if (!resetJustification.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Justification Required", 
        description: "An audit justification is required." 
      });
      return;
    }

    setIsResetting(true);

    try {
      const result: any = await resetFinancialDataAction({ 
        justification: resetJustification,
        adminEmail: user?.email || 'tharushyamagara@gmail.com'
      });

      toast({ 
        title: "Financial Ledger Reset to 0", 
        description: `Successfully wiped ${result?.summary?.contributionsDeleted || 0} contributions, ${result?.summary?.loansDeleted || 0} loans, and reset all member savings and interest balances to 0.` 
      });

      setIsResetDialogOpen(false);
      setResetConfirmationText('');
      setResetJustification('');
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Reset Operation Failed", 
        description: error.message || 'An error occurred while resetting financial records.' 
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (userLoading || settingsLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldCheck className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can access system settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">System Settings</h1>
          <p className="text-[12px] font-bold text-muted-foreground">Manage global financial rules, interest models, and lending policies</p>
        </div>
        {isSuperAdmin && (
          <Badge variant="outline" className="self-start sm:self-auto bg-primary/10 text-primary border-primary/20 px-2.5 py-0.5 text-[9px] font-bold">
            Super Administrator Active
          </Badge>
        )}
      </div>

      <form onSubmit={handleUpdateSettings}>
        <div className="grid gap-4 sm:gap-6">
          {/* Regional Settings Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
                <Globe className="h-4 w-4 text-primary" /> Regional Settings
              </CardTitle>
              <CardDescription>Configure currency and display preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-sm">
                <Label>System Currency</Label>
                <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                  <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                    <SelectValue placeholder="Select Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RWF">Rwandan Franc (RWF)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Lending Constraints Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Wallet className="h-5 w-5" /> Lending Constraints
              </CardTitle>
              <CardDescription>Define limits for member loans and risk management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1 font-bold">Member Borrowing Power (%) <Percent className="h-3 w-3 text-primary" /></Label>
                  <Input 
                    name="maxLoanPercentage" 
                    type="number" 
                    step="1" 
                    defaultValue={settings.maxLoanPercentage ?? 200} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Max % of total verified contributions an individual member can borrow (e.g. 200% allows borrowing 2x their savings).
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1 font-bold text-primary">Lending Pool Ceiling (% of Total Assets) <Percent className="h-3 w-3 text-primary" /></Label>
                  <Input 
                    name="maxLendingPoolPercentage" 
                    type="number" 
                    step="1" 
                    min="1"
                    max="100"
                    defaultValue={settings.maxLendingPoolPercentage ?? 90} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none font-bold text-primary"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Ceiling % of total net assets permitted for active loans. If active loans reach this % (e.g. 90%), new loan applications and approvals are blocked with &quot;No funds available to loan from&quot;.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <div className="space-y-2 max-w-sm">
                  <Label>Min Loan Amount</Label>
                  <Input 
                    name="minLoanAmount" 
                    type="number" 
                    defaultValue={settings.minLoanAmount || 5000} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Minimum threshold required per loan request. Dynamic borrowing capacity is governed by member savings ({settings.maxLoanPercentage || 200}%) with exceptional approvals for higher amounts.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="space-y-2 max-w-sm">
                   <Label className="flex items-center gap-1">Late Payment Penalty (%) <AlertTriangle className="h-3 w-3 text-foreground" /></Label>
                   <Input 
                     name="penaltyRate" 
                     type="number" 
                     step="0.1" 
                     defaultValue={settings.penaltyRate || 2} 
                     required 
                     className="h-11 rounded-[10px] bg-muted border-none"
                   />
                   <p className="text-[10px] text-muted-foreground">Rate applied to installments past their due date.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deposit Bank Information Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Landmark className="h-5 w-5" /> Deposit Bank &amp; Account Details
              </CardTitle>
              <CardDescription>
                Configure the deposit account where members send contributions and loan repayments. This will be displayed below the amount fields across the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-bold flex items-center gap-1.5">
                    <Landmark className="h-4 w-4 text-primary" /> Deposit Bank Name
                  </Label>
                  <Input 
                    name="depositBankName" 
                    value={depositBankName}
                    onChange={(e) => setDepositBankName(e.target.value)}
                    placeholder="e.g. Bank of Kigali, Equity Bank, I&M Bank" 
                    className="h-11 rounded-[10px] bg-muted border-none font-medium"
                  />
                  <p className="text-[10px] text-muted-foreground">The commercial bank name where members deposit funds.</p>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" /> Deposit Account Number
                  </Label>
                  <Input 
                    name="depositAccountNumber" 
                    value={depositAccountNumber}
                    onChange={(e) => setDepositAccountNumber(e.target.value)}
                    placeholder="e.g. 00044-01234567-89" 
                    className="h-11 rounded-[10px] bg-muted border-none font-mono font-medium"
                  />
                  <p className="text-[10px] text-muted-foreground">The account number displayed below amount inputs.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platform Branding & Customization Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <ShieldCheck className="h-5 w-5" /> Platform Branding &amp; Infrastructure
              </CardTitle>
              <CardDescription>
                Customize the infrastructure attribution text and footer credentials displayed across the application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xl">
                <Label htmlFor="infrastructureBranding" className="font-bold flex items-center gap-1.5">
                  Footer Attribution Text
                </Label>
                <Input 
                  id="infrastructureBranding"
                  name="infrastructureBranding" 
                  value={infrastructureBranding}
                  onChange={(e) => setInfrastructureBranding(e.target.value)}
                  placeholder="e.g. Secure Infrastructure Provided by ORVEXI" 
                  className="h-11 rounded-[10px] bg-muted border-none font-medium"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  This text is dynamically displayed in the footer of the member login screen, the admin login screen, and the member portal. Default: <span className="font-semibold">&ldquo;Secure Infrastructure Provided by ORVEXI&rdquo;</span>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Interest Policy Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Scale className="h-5 w-5" /> Interest Policy (LOCKED Fields)
              </CardTitle>
              <CardDescription>Configure global rates that will be locked during loan requests and approvals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Interest Model</Label>
                  <Select value={interestModel} onValueChange={setInterestModel}>
                    <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-off">One-Off (Flat)</SelectItem>
                      <SelectItem value="monthly">Monthly Interest</SelectItem>
                      <SelectItem value="yearly">Yearly (APR)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Sets how interest is calculated globally.</p>
                </div>
                <div className="space-y-2">
                  <Label>Interest Type (Deduction)</Label>
                  <Select value={interestType} onValueChange={setInterestType}>
                    <SelectTrigger className="h-11 rounded-[10px] bg-muted border-none">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Discounted (Deduct Now)</SelectItem>
                      <SelectItem value="afterward">Added-on (Pay Later)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Sets if interest is taken at source or added to principal.</p>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Global Interest Rate (%)</Label>
                  <Input 
                    name="loanInterestRate" 
                    type="number" 
                    step="0.01" 
                    defaultValue={settings.loanInterestRate || 10} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground">Rate charged to borrowers. This will be read-only in the application process.</p>
                </div>
                <div className="space-y-2">
                  <Label>Target Monthly Contribution</Label>
                  <Input 
                    name="contributionInterestRate" 
                    type="number" 
                    defaultValue={settings.contributionInterestRate || 50000} 
                    required 
                    className="h-11 rounded-[10px] bg-muted border-none"
                  />
                  <p className="text-[10px] text-muted-foreground">Standard monthly contribution target.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Authorization Card */}
          <Card className="border border-border shadow-sm bg-card rounded-[10px] border-primary/10">
            <CardHeader>
              <CardTitle className="text-xl">Authorization</CardTitle>
              <CardDescription>Confirm changes with a permanent audit justification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="justification">Audit Justification</Label>
                <Textarea 
                  id="justification"
                  name="justification" 
                  placeholder="E.g., Adjusted borrowing limits based on Board resolution..." 
                  required 
                  className="rounded-[10px] min-h-[100px] bg-muted border-none"
                />
              </div>
              <Button type="submit" disabled={isUpdating} className="w-full h-12 rounded-[10px] font-bold shadow-lg shadow-primary/20">
                {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                Save Financial Policies
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>

      {/* Super Admin: Danger Zone Section */}
      {isSuperAdmin && (
        <div className="pt-6">
          <Card className="border-2 border-destructive/30 shadow-lg bg-destructive/5 rounded-2xl overflow-hidden">
            <CardHeader className="bg-destructive/10 border-b border-destructive/20">
              <div className="flex items-center gap-2 text-destructive">
                <AlertOctagon className="h-6 w-6" />
                <CardTitle className="text-xl font-bold">Super Admin: Danger Zone</CardTitle>
              </div>
              <CardDescription className="text-destructive/80 font-medium">
                Irreversible administrative actions reserved strictly for the Super Administrator.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-destructive" />
                  Reset All Financial Ledger Data to Zero (0)
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This action performs a complete financial wipe across the entire tontine platform. It will:
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1 pl-1">
                  <li>Purge all member <strong>savings contributions</strong> (total pot becomes 0 {selectedCurrency}).</li>
                  <li>Purge all <strong>loans, repayment schedules, and debt records</strong>.</li>
                  <li>Reset all member <strong>accumulated interest and profit balances to 0 {selectedCurrency}</strong>.</li>
                  <li>Clear all <strong>interest distribution records</strong> and undistributed profit pools.</li>
                  <li><strong className="text-foreground">Preserve</strong> all user member accounts, credentials, phone numbers, and system policies.</li>
                </ul>
              </div>

              <div className="pt-2">
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={() => {
                    setResetConfirmationText('');
                    setResetJustification('');
                    setIsResetDialogOpen(true);
                  }}
                  className="font-bold h-11 rounded-xl shadow-md flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Reset All Financial Data to 0
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Super Admin Reset Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <form onSubmit={handleResetFinancialData}>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                <DialogTitle className="text-xl font-bold">Confirm Full Financial Reset to 0</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                This action is <strong className="text-destructive">permanent and irreversible</strong>. All contributions, active loans, debt balances, and accumulated member interest will be set to 0.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Security Verification Required
                </div>
                <p className="text-xs text-muted-foreground">
                  User accounts and login credentials will remain intact. Only the financial ledgers will be reset to a clean zero state.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resetJustification" className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Audit Justification (Required)
                </Label>
                <Textarea 
                  id="resetJustification"
                  required
                  placeholder="e.g. Official annual tontine close-out / System initialization for new cycle."
                  value={resetJustification}
                  onChange={(e) => setResetJustification(e.target.value)}
                  className="rounded-xl min-h-[70px] bg-muted border-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmationText" className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  To confirm, type <span className="font-mono text-destructive select-all font-bold">RESET FINANCIAL DATA</span> below:
                </Label>
                <Input 
                  id="confirmationText"
                  required
                  placeholder="RESET FINANCIAL DATA"
                  value={resetConfirmationText}
                  onChange={(e) => setResetConfirmationText(e.target.value)}
                  className="h-11 rounded-xl font-mono text-sm bg-muted border-none"
                  autoComplete="off"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={isResetting || resetConfirmationText.trim() !== 'RESET FINANCIAL DATA' || !resetJustification.trim()}
                className="font-bold shadow-lg"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting All Financial Data...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Wipe & Set All Financial Data to 0
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
