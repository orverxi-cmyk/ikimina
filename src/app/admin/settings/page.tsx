'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, collection, query, orderBy } from 'firebase/firestore';
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
  CreditCard,
  FileText,
  Lock,
  TrendingUp,
  Sparkles,
  HelpCircle,
  Coins,
  Check
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
import { updateFinancialSettingsAction, resetFinancialDataAction, initiateInterestDistributionAction } from '@/lib/finance-client';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getDefaultAbout, getDefaultTerms, getDefaultPrivacy, DEFAULT_APP_NAME } from '@/lib/legal-defaults';
import { formatCurrency } from '@/lib/currency';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import Link from 'next/link';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings, loading: settingsLoading, refreshSettings } = useSettings();
  const currency = settings.currency || 'RWF';
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);

  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('RWF');
  const [interestModel, setInterestModel] = useState<string>('one-off');
  const [interestType, setInterestType] = useState<string>('immediate');
  const [depositBankName, setDepositBankName] = useState<string>('');
  const [depositAccountNumber, setDepositAccountNumber] = useState<string>('');
  const [infrastructureBranding, setInfrastructureBranding] = useState<string>('Secure Infrastructure Provided by ORVEXI');
  const [appName, setAppName] = useState<string>('Ikimina App');
  const [activeTab, setActiveTab] = useState<string>('financials');
  const [aboutUs, setAboutUs] = useState<string>('');
  const [termsOfService, setTermsOfService] = useState<string>('');
  const [privacyPolicy, setPrivacyPolicy] = useState<string>('');
  const [copyrightNotice, setCopyrightNotice] = useState<string>('');

  // Allocation Configuration (Screenshot 3) State
  const [distributeAmountInput, setDistributeAmountInput] = useState<string>('');
  const [justificationInput, setJustificationInput] = useState<string>('');
  const [isInitiatingDistribution, setIsInitiatingDistribution] = useState(false);

  // Super Admin Reset State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetJustification, setResetJustification] = useState('');

  // Subscriptions for Interest Pool Calculations
  const loansQuery = useMemoFirebase(() => query(collection(firestore, 'loans')), [firestore]);
  const { data: loansSnap } = useCollection(loansQuery);

  const contributionsQuery = useMemoFirebase(() => query(collection(firestore, 'contributions')), [firestore]);
  const { data: contributionsSnap } = useCollection(contributionsQuery);

  const auditLogsQuery = useMemoFirebase(() => query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')), [firestore]);
  const { data: auditLogsSnap } = useCollection(auditLogsQuery);

  const poolMetrics = useMemo(() => {
    const rawLoans = loansSnap?.docs.map(d => d.data()) || [];
    const rawContributions = contributionsSnap?.docs.map(d => d.data()) || [];
    const rawLogs = auditLogsSnap?.docs.map(d => d.data()) || [];

    const totalRealizedInterest = rawLoans.reduce((acc, l: any) => {
      if (l.status === 'completed' || l.status === 'approved') {
        return acc + (Number(l.interestAmount) || 0);
      }
      return acc;
    }, 0);

    const lifetimeDistributedInterest = rawLogs.reduce((acc, log: any) => {
      if (log.action === 'ALLOCATE_INTEREST') {
        return acc + (Number(log.details?.totalDistributed) || 0);
      }
      return acc;
    }, 0);

    const availableUndistributedInterest = Math.max(0, totalRealizedInterest - lifetimeDistributedInterest);

    let totalVerifiedSavings = 0;
    rawContributions.forEach((c: any) => {
      if (c.status === 'verified') {
        totalVerifiedSavings += (Number(c.amount) || 0);
      }
    });

    return {
      totalRealizedInterest,
      lifetimeDistributedInterest,
      availableUndistributedInterest,
      totalVerifiedSavings
    };
  }, [loansSnap, contributionsSnap, auditLogsSnap]);

  useEffect(() => {
    if (settings) {
      if (settings.currency) setSelectedCurrency(settings.currency);
      if (settings.interestModel) setInterestModel(settings.interestModel);
      if (settings.interestType) setInterestType(settings.interestType);
      if (settings.depositBankName !== undefined) setDepositBankName(settings.depositBankName);
      if (settings.depositAccountNumber !== undefined) setDepositAccountNumber(settings.depositAccountNumber);
      if (settings.infrastructureBranding !== undefined) setInfrastructureBranding(settings.infrastructureBranding);
      if (settings.appName !== undefined) setAppName(settings.appName);
      const effectiveName = settings.appName?.trim() || DEFAULT_APP_NAME;
      setAboutUs(settings.aboutUs?.trim() || getDefaultAbout(effectiveName));
      setTermsOfService(settings.termsOfService?.trim() || getDefaultTerms(effectiveName));
      setPrivacyPolicy(settings.privacyPolicy?.trim() || getDefaultPrivacy(effectiveName));
      if (settings.copyrightNotice !== undefined) setCopyrightNotice(settings.copyrightNotice);
    }
  }, [settings]);

  const isAdmin = userData?.role === 'admin';
  const isSuperAdmin = userData?.isSuperAdmin === true || user?.email === 'tharushyamagara@gmail.com';
  const isAccountant = userData?.role === 'accountant' || isAdmin;

  const parsedDistributeAmount = Number(distributeAmountInput) || 0;
  const isAmountValid = parsedDistributeAmount > 0 && parsedDistributeAmount <= poolMetrics.availableUndistributedInterest;
  const isAmountExceeded = parsedDistributeAmount > poolMetrics.availableUndistributedInterest;

  const handleQuickFill = (percentage: number) => {
    if (poolMetrics.availableUndistributedInterest <= 0) return;
    const amount = Math.floor((poolMetrics.availableUndistributedInterest * percentage) / 100);
    setDistributeAmountInput(amount.toString());
  };

  const handleInitiateDistributionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAccountant) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently offline. Please reconnect before submitting.",
      });
    }

    if (!isAmountValid) {
      return toast({
        variant: "destructive",
        title: "Invalid Distribution Amount",
        description: `Please enter a valid amount up to ${formatCurrency(poolMetrics.availableUndistributedInterest, currency)}.`,
      });
    }

    if (!justificationInput.trim()) {
      return toast({
        variant: "destructive",
        title: "Justification Required",
        description: "Please provide audit justification and resolution notes.",
      });
    }

    setIsInitiatingDistribution(true);
    try {
      const res = await initiateInterestDistributionAction({
        totalInterestToDistribute: parsedDistributeAmount,
        justification: justificationInput.trim(),
      });

      toast({
        title: "Interest Distribution Proposal Initiated",
        description: `Proposal #${res.requestId.slice(0, 10)} for ${formatCurrency(res.totalInterestToDistribute, currency)} submitted to Approvals Hub for dual-control Super Admin sign-off.`,
      });

      setDistributeAmountInput('');
      setJustificationInput('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Failed to Initiate Proposal",
        description: parsed.message,
      });
    } finally {
      setIsInitiatingDistribution(false);
    }
  };

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
    const appNameVal = (formData.get('appName') as string)?.trim() || appName || 'Ikimina App';
    const aboutUsVal = (formData.get('aboutUs') as string)?.trim() ?? aboutUs;
    const termsOfServiceVal = (formData.get('termsOfService') as string)?.trim() ?? termsOfService;
    const privacyPolicyVal = (formData.get('privacyPolicy') as string)?.trim() ?? privacyPolicy;
    const copyrightNoticeVal = (formData.get('copyrightNotice') as string)?.trim() ?? copyrightNotice;
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
        appName: appNameVal,
        aboutUs: aboutUsVal,
        termsOfService: termsOfServiceVal,
        privacyPolicy: privacyPolicyVal,
        copyrightNotice: copyrightNoticeVal,
        justification 
      });
      await refreshSettings();
      toast({ title: "Settings Updated", description: "Financial policies and platform identity updated successfully." });
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
        description: `Successfully wiped ${result?.summary?.contributionsDeleted || 0} contributions, ${result?.summary?.loansDeleted || 0} loans, ${result?.summary?.expensesDeleted || 0} operating expenses, and reset all member savings and interest balances to 0.` 
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

  if (!isAdmin && !isAccountant) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldCheck className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators and accountants can access system settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">System Settings</h1>
          <p className="text-[12px] font-bold text-muted-foreground">Manage financial rules, profit distribution configuration, platform identity, and administrative tools</p>
        </div>
        {isSuperAdmin && (
          <Badge variant="outline" className="self-start sm:self-auto bg-primary/10 text-primary border-primary/20 px-2.5 py-0.5 text-[9px] font-bold">
            Super Administrator Active
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-4 bg-muted p-1 rounded-xl h-11 border border-border/60 gap-1">
            <TabsTrigger id="tab-financials" value="financials" className="rounded-lg font-bold text-xs gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Wallet className="h-4 w-4 text-primary" /> Financials
            </TabsTrigger>
            <TabsTrigger id="tab-interest" value="interest" className="rounded-lg font-bold text-xs gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <TrendingUp className="h-4 w-4 text-primary" /> Interest Allocation
            </TabsTrigger>
            <TabsTrigger id="tab-identity" value="identity" className="rounded-lg font-bold text-xs gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ShieldCheck className="h-4 w-4 text-primary" /> Identity
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger id="tab-reset" value="reset" className="rounded-lg font-bold text-xs gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:text-destructive data-[state=active]:shadow-sm">
                <RotateCcw className="h-4 w-4" /> Reset
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* 1. FINANCIAL POLICIES TAB */}
        <TabsContent value="financials" className="mt-0 space-y-4 sm:space-y-6">
          <form onSubmit={handleUpdateSettings} className="space-y-6">
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
                      Ceiling % of total net assets permitted for active loans. If active loans reach this %, new loans are blocked.
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
                      Minimum threshold required per loan request.
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
                  Configure the deposit account where members send contributions and loan repayments.
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
                    <p className="text-[10px] text-muted-foreground">Rate charged to borrowers.</p>
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
          </form>
        </TabsContent>

        {/* 2. INTEREST ALLOCATION CONFIGURATION TAB (SCREENSHOT 3) */}
        <TabsContent value="interest" className="mt-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Card: Allocation Configuration Form */}
            <div className="md:col-span-7 space-y-6">
              <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
                <CardHeader className="bg-blue-600 text-white border-b border-blue-700/60 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> Allocation Configuration
                      </CardTitle>
                      <CardDescription className="text-blue-100 text-xs mt-0.5">
                        Set the total profit amount to be credited pro-rata.
                      </CardDescription>
                    </div>
                    {poolMetrics.availableUndistributedInterest > 0 && (
                      <Badge className="bg-white/20 text-white border-none text-[10px] font-bold">
                        Available: {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-5">
                  <form onSubmit={handleInitiateDistributionSubmit} className="space-y-5">
                    {/* Amount Input with Quick-Fills */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="distribute-amount" className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Distribution Amount ({currency})
                        </Label>
                        {poolMetrics.availableUndistributedInterest > 0 && (
                          <span className="text-[11px] font-bold text-primary">
                            Max: {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}
                          </span>
                        )}
                      </div>

                      <Input
                        id="distribute-amount"
                        type="number"
                        min="1"
                        max={poolMetrics.availableUndistributedInterest}
                        step="1"
                        required
                        disabled={poolMetrics.availableUndistributedInterest <= 0 || isInitiatingDistribution}
                        placeholder="e.g. 0"
                        value={distributeAmountInput}
                        onChange={(e) => setDistributeAmountInput(e.target.value)}
                        className={`h-12 rounded-xl text-lg font-bold bg-muted/40 border-2 ${
                          isAmountExceeded
                            ? 'border-destructive text-destructive focus-visible:ring-destructive'
                            : isAmountValid
                            ? 'border-green-600/50'
                            : ''
                        }`}
                      />

                      {/* Quick Fill Buttons */}
                      {poolMetrics.availableUndistributedInterest > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground mr-1">Quick Fill:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(100)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50 text-primary border-primary/30"
                          >
                            100% ({formatCurrency(poolMetrics.availableUndistributedInterest, currency)})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(50)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50"
                          >
                            50% ({formatCurrency(Math.floor(poolMetrics.availableUndistributedInterest * 0.5), currency)})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFill(25)}
                            className="h-6 text-[10px] font-bold px-2 rounded-md hover:border-primary/50"
                          >
                            25% ({formatCurrency(Math.floor(poolMetrics.availableUndistributedInterest * 0.25), currency)})
                          </Button>
                        </div>
                      )}

                      {/* Status / Notices */}
                      {isAmountExceeded && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-bold flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p>Amount exceeds available undistributed pool.</p>
                            <p className="text-[11px] font-normal opacity-90 mt-0.5">
                              The maximum unallocated profit currently available to share is {formatCurrency(poolMetrics.availableUndistributedInterest, currency)}.
                            </p>
                          </div>
                        </div>
                      )}

                      {poolMetrics.availableUndistributedInterest <= 0 && (
                        <div className="p-3 bg-muted rounded-xl text-xs text-muted-foreground flex items-center gap-2">
                          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>All realized loan interests have already been distributed to members.</span>
                        </div>
                      )}
                    </div>

                    {/* Audit Justification */}
                    <div className="space-y-2">
                      <Label htmlFor="audit-justification" className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Audit Justification &amp; Resolution Notes <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="audit-justification"
                        required
                        disabled={poolMetrics.availableUndistributedInterest <= 0 || isInitiatingDistribution}
                        placeholder="e.g. Q3 2026 interest dividend allocation approved by executive committee for fully repaid cooperative loans."
                        value={justificationInput}
                        onChange={(e) => setJustificationInput(e.target.value)}
                        rows={3}
                        className="rounded-xl text-xs bg-muted/40"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        This note will be permanently logged in the Immutable Audit Trail and attached to all member ledger statements.
                      </p>
                    </div>

                    {/* Submit Action */}
                    <Button
                      type="submit"
                      disabled={!isAmountValid || !justificationInput.trim() || isInitiatingDistribution}
                      className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all gap-2"
                    >
                      {isInitiatingDistribution ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Staging Distribution Proposal...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Review &amp; Distribute Profits
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Right Card: Two Payout Channels & Calculation Formula (Screenshot 3) */}
            <div className="md:col-span-5 space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <HelpCircle className="h-4 w-4" /> Two Payout Channels
                </div>
                
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-foreground font-semibold">Add to Total Contribution (Reinvestment):</strong>{' '}
                      Excluded from cash payouts. Directly creates a verified contribution savings record, boosting the member&apos;s savings and future loan qualification multiplier.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-foreground font-semibold">Receive Cash Payout:</strong>{' '}
                      Directly credits the member&apos;s liquid accrued interest balance for cash disbursement.
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-primary/10 space-y-2">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                    Calculation Formula
                  </div>
                  <div className="bg-background border border-border/80 rounded-xl p-3.5 shadow-xs">
                    <div className="text-xs font-mono font-medium text-foreground flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="text-primary font-semibold">Member Share</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-medium">
                        (Member Savings &divide; Total Savings)
                      </span>
                      <span className="text-muted-foreground">&times;</span>
                      <span className="font-semibold text-foreground">Total Dividend</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Once initiated, the distribution proposal will appear in the <Link href="/admin/approvals" className="font-bold text-primary hover:underline">Approvals Hub &rarr;</Link> for Super Administrator dual-control sign-off.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 3. PLATFORM IDENTITY & LEGAL POLICIES TAB */}
        <TabsContent value="identity" className="mt-0 space-y-6">
          <form onSubmit={handleUpdateSettings}>
            <Card className="border border-border shadow-sm bg-card rounded-[10px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-primary">
                  <ShieldCheck className="h-5 w-5" /> Platform Branding, Footer &amp; Legal Policies
                </CardTitle>
                <CardDescription>
                  Customize the platform footer, infrastructure attribution, About Us section, Terms of Service, and Privacy Policy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* App Name */}
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="appName" className="font-bold flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-primary" /> Application Name
                  </Label>
                  <Input
                    id="appName"
                    name="appName"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="e.g. Umurenge Savings Group"
                    maxLength={60}
                    className="h-11 rounded-[10px] bg-muted border-none font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Shown in the header, login screen, footer, and legal pages across the member and admin portals.
                  </p>
                </div>

                {/* Attribution and Copyright Row */}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="infrastructureBranding" className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary" /> Footer Infrastructure Attribution
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
                      Displayed in the footer across member &amp; admin login cards and portal.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="copyrightNotice" className="font-bold flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-primary" /> Custom Copyright Statement
                    </Label>
                    <Input 
                      id="copyrightNotice"
                      name="copyrightNotice" 
                      value={copyrightNotice}
                      onChange={(e) => setCopyrightNotice(e.target.value)}
                      placeholder={`e.g. © ${new Date().getFullYear()} ${appName || 'Your Organization'}. All rights reserved.`}
                      className="h-11 rounded-[10px] bg-muted border-none font-medium"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Leave blank to automatically display the default copyright with the current year.
                    </p>
                  </div>
                </div>

                {/* About Us */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="aboutUs" className="font-bold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-primary" /> About Us (Organization / Scheme Description)
                  </Label>
                  <Textarea
                    id="aboutUs"
                    name="aboutUs"
                    value={aboutUs}
                    onChange={(e) => setAboutUs(e.target.value)}
                    placeholder="Describe your savings group, mission, community objectives, and scheme overview..."
                    rows={4}
                    className="rounded-[10px] bg-muted border-none font-medium text-xs leading-relaxed resize-y"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Displayed when members or administrators click &ldquo;About&rdquo; in the desktop footer.
                  </p>
                </div>

                {/* Terms of Service */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="termsOfService" className="font-bold flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" /> Terms of Service &amp; Governance Rules
                  </Label>
                  <Textarea
                    id="termsOfService"
                    name="termsOfService"
                    value={termsOfService}
                    onChange={(e) => setTermsOfService(e.target.value)}
                    placeholder="Specify contribution commitments, loan repayment obligations, penalty terms, and governance policies..."
                    rows={12}
                    className="rounded-[10px] bg-muted border-none font-medium text-xs leading-relaxed resize-y"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Displayed when members or administrators click &ldquo;Terms of Service&rdquo; in the desktop footer.
                  </p>
                </div>

                {/* Privacy Policy */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="privacyPolicy" className="font-bold flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-primary" /> Privacy Policy &amp; Data Protection
                  </Label>
                  <Textarea
                    id="privacyPolicy"
                    name="privacyPolicy"
                    value={privacyPolicy}
                    onChange={(e) => setPrivacyPolicy(e.target.value)}
                    placeholder="Detail member data confidentiality, financial record security, and access standards..."
                    rows={12}
                    className="rounded-[10px] bg-muted border-none font-medium text-xs leading-relaxed resize-y"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Displayed when members or administrators click &ldquo;Privacy Policy&rdquo; in the desktop footer.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm bg-card rounded-[10px] border-primary/10 mt-6">
              <CardHeader>
                <CardTitle className="text-xl">Authorization</CardTitle>
                <CardDescription>Confirm changes with a permanent audit justification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="justification-identity">Audit Justification</Label>
                  <Textarea 
                    id="justification-identity"
                    name="justification" 
                    placeholder="E.g., Updated organizational About Us information and app branding..." 
                    required 
                    className="rounded-[10px] min-h-[100px] bg-muted border-none"
                  />
                </div>
                <Button type="submit" disabled={isUpdating} className="w-full h-12 rounded-[10px] font-bold shadow-lg shadow-primary/20">
                  {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                  Save Identity Settings
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* 4. SUPER ADMIN DANGER ZONE RESET TAB */}
        {isSuperAdmin && (
          <TabsContent value="reset" className="mt-0">
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
                    <li>Purge all member <strong>savings contributions</strong> (total pot becomes 0 {currency}).</li>
                    <li>Purge all <strong>loans, repayment schedules, and debt records</strong>.</li>
                    <li>Reset all member <strong>accumulated interest and profit balances to 0 {currency}</strong>.</li>
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
          </TabsContent>
        )}
      </Tabs>

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
