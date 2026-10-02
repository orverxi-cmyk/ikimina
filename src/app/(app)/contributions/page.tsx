'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, AlertCircle, Loader2, ShieldCheck, Upload, FileText, Info, Eye, Clock, Ban, CheckCircle2, RotateCcw, Plus, FileSpreadsheet, Wallet, Landmark } from 'lucide-react';
import Link from 'next/link';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, where, doc } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  verifyContributionAction, 
  rejectContributionAction, 
  recordContributionAction, 
  submitContributionAction,
  reverseContributionAction 
} from '@/lib/finance-client';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from '@/context/settings-context';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

export default function ContributionsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);
  
  const { settings } = useSettings();
  const currency = settings.currency;
  const defaultAmount = settings.contributionInterestRate;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [isReverseOpen, setIsReverseOpen] = useState(false);
  const [reversalJustification, setReversalJustification] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'MMMM yyyy'));
  const [selectedContribution, setSelectedContribution] = useState<any>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('history');

  const role = userData?.role || 'member';
  const isManagement = role === 'management' || role === 'admin' || role === 'accountant';
  const isAccountantOrAdmin = role === 'admin' || role === 'accountant';
  const isLoading = userDataLoading;

  // Firestore Subscriptions
  const membersQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData || !isManagement) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [user, isManagement, isLoading, userData]);
  
  const contributionsQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData) return null;
    
    if (isManagement) {
      return query(
        collection(firestore, 'contributions'), 
        orderBy('date', 'desc')
      );
    }
    
    return query(
      collection(firestore, 'contributions'), 
      where('memberId', '==', user.uid),
      orderBy('date', 'desc')
    );
  }, [user, isManagement, isLoading, userData]);

  const { data: membersSnap } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions, error: contributionsError } = useCollection(contributionsQuery);

  const members = useMemo(() => {
    return (membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || []) as any[];
  }, [membersSnap]);
  
  const contributions = useMemo(() => {
    return (contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || []) as any[];
  }, [contributionsSnap]);

  const totalVerifiedBalance = useMemo(() => {
    return contributions
      .filter((c: any) => c.status === 'verified')
      .reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
  }, [contributions]);
  
  const pendingContributions = useMemo(() => contributions.filter((c: any) => c.status === 'pending'), [contributions]);
  const verifiedContributions = useMemo(() => contributions.filter((c: any) => c.status === 'verified'), [contributions]);
  const rejectedContributions = useMemo(() => contributions.filter((c: any) => c.status === 'rejected'), [contributions]);
  const reversedContributions = useMemo(() => contributions.filter((c: any) => c.status === 'reversed'), [contributions]);

  const handleReverseContribution = async () => {
    if (!selectedContribution || !reversalJustification.trim()) {
      toast({
        variant: "destructive",
        title: "Justification Required",
        description: "Please provide an audit justification for reversing the contribution approval."
      });
      return;
    }

    setIsReversing(true);
    try {
      await reverseContributionAction({
        contributionId: selectedContribution.id,
        justification: reversalJustification.trim()
      });
      toast({
        title: "Approval Reversed",
        description: `Contribution of ${formatCurrency(selectedContribution.amount || 0, currency)} has been reversed and removed from verified savings.`
      });
      setIsReverseOpen(false);
      setSelectedContribution(null);
      setReversalJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Reversal Failed",
        description: parsed.message
      });
    } finally {
      setIsReversing(false);
    }
  };

  const handleSubmitContribution = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before uploading proof of payment.",
      });
    }

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const period = formData.get('period') as string;
    const proofFile = formData.get('proofFile') as File;

    if (!proofFile || proofFile.size === 0) {
      toast({ variant: "destructive", title: "File Required", description: "Please upload a proof of payment." });
      setIsSubmitting(false);
      return;
    }

    try {
      const fileRef = ref(storage, `contribution_proofs/${user.uid}/${Date.now()}_${proofFile.name}`);
      const uploadResult = await uploadBytes(fileRef, proofFile);
      const proofUrl = await getDownloadURL(uploadResult.ref);

      await submitContributionAction({
        amount,
        period,
        proofUrl
      });

      toast({ title: "Submitted", description: "Your contribution has been submitted for verification." });
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Submission Failed", description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !isManagement) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before recording contributions.",
      });
    }

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    
    const data = {
      memberId: formData.get('memberId') as string,
      amount: Number(formData.get('amount')),
      period: formData.get('period') as string,
      justification: formData.get('justification') as string
    };

    try {
      await recordContributionAction(user.uid, data);
      toast({ title: "Recorded", description: "Manual contribution has been officially added to the ledger." });
      setIsManualEntryOpen(false);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Recording Failed", description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionContribution = async (type: 'verify' | 'reject', e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedContribution) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before verifying or rejecting contributions.",
      });
    }
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      if (type === 'verify') {
        await verifyContributionAction(user.uid, {
          contributionId: selectedContribution.id,
          justification
        });
        toast({ title: "Verified", description: "Contribution has been officially verified." });
      } else {
        await rejectContributionAction(user.uid, {
          contributionId: selectedContribution.id,
          rejectionReason: justification
        });
        toast({ title: "Rejected", description: "Contribution submission has been rejected." });
      }
      setIsVerifyOpen(false);
      setSelectedContribution(null);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Action Failed", description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMemberName = (id: string) => {
    if (id === user?.uid) return userData?.name || 'Me';
    return members.find((m: any) => m.id === id)?.name || 'Unknown Member';
  };

  const periods = [
    format(new Date(), 'MMMM yyyy'),
    format(subMonths(new Date(), 1), 'MMMM yyyy'),
    format(subMonths(new Date(), 2), 'MMMM yyyy')
  ];

  const renderTable = (data: any[]) => (
    <div className="w-full max-w-full overflow-x-auto touch-pan-x overscroll-x-contain">
      <Table className="min-w-[620px] w-full">
        <TableHeader className="bg-muted/10">
          <TableRow>
            {isManagement && <TableHead className="px-4 py-3 whitespace-nowrap">Member</TableHead>}
            <TableHead className={cn(!isManagement && "px-4", "py-3 whitespace-nowrap")}>Period</TableHead>
            <TableHead className="px-4 py-3 whitespace-nowrap">Date</TableHead>
            <TableHead className="px-4 py-3 whitespace-nowrap">Status</TableHead>
            <TableHead className="text-right px-4 py-3 whitespace-nowrap">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingContributions ? (
            <TableRow>
              <TableCell colSpan={isManagement ? 5 : 4} className="h-24 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isManagement ? 5 : 4} className="h-24 text-center text-muted-foreground italic">
                No transactions found in this view.
              </TableCell>
            </TableRow>
          ) : (
            data.map((h: any) => (
              <TableRow key={h.id} className="hover:bg-muted/30 transition-colors">
                {isManagement && (
                  <TableCell className="font-bold px-4 py-3 whitespace-nowrap text-[12px]">
                    {getMemberName(h.memberId)}
                  </TableCell>
                )}
                <TableCell className={cn("font-medium px-4 py-3 whitespace-nowrap text-[12px]", !isManagement && "px-4")}>
                  {h.period}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground px-4 py-3 whitespace-nowrap">
                  {h.date?.seconds ? format(new Date(h.date.seconds * 1000), 'MMM d, yyyy') : 'Processing...'}
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    <Badge 
                      variant={h.status === 'pending' ? 'secondary' : h.status === 'rejected' ? 'destructive' : h.status === 'reversed' ? 'outline' : 'default'} 
                      className={cn(
                        "text-[9px] uppercase font-bold border-none shrink-0",
                        h.status === 'pending' && "bg-primary/10 text-primary",
                        h.status === 'verified' && "bg-green-600/10 text-green-600",
                        h.status === 'reversed' && "bg-muted text-muted-foreground",
                        h.status === 'rejected' && "bg-destructive/10 text-destructive"
                      )}
                    >
                      {h.status}
                    </Badge>
                    {(h.source === 'payroll_deduction' || h.paymentMethod === 'payroll_deduction') && (
                      <Badge variant="outline" className="text-[8px] uppercase font-bold border-blue-500/30 text-blue-600 bg-blue-500/5 shrink-0">
                        Payroll
                      </Badge>
                    )}
                    {h.status === 'verified' && isManagement && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { setSelectedContribution(h); setIsReverseOpen(true); }}
                        className="h-6 px-1.5 text-[9px] font-bold text-destructive border-destructive/30 hover:bg-destructive/10 rounded-md gap-1 shrink-0"
                        title="Reverse Approval"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Reverse
                      </Button>
                    )}
                    {h.status === 'rejected' && !isManagement && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSelectedContribution(h); setIsVerifyOpen(true); }}>
                         <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                    {h.proofUrl && (
                      <a href={h.proofUrl} target="_blank" rel="noopener noreferrer" title="View Proof" className="shrink-0">
                        <FileText className="h-4 w-4 text-primary hover:scale-110 transition-transform cursor-pointer" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right px-4 py-3 font-bold whitespace-nowrap text-[12px]">{formatCurrency(h.amount, currency)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-24 w-full min-w-0 overflow-x-hidden">
      {/* Header & Global Action CTAs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              {isManagement ? "Administrative Console" : "Member Savings Portfolio"}
            </Badge>
          </div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">Savings &amp; Contributions</h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            {isManagement ? "Audit, record, and bulk-import member savings" : "Track your verified wealth and pending submissions"}
          </p>
        </div>

        {/* Global Action CTAs */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          {isAccountantOrAdmin && (
            <Button asChild variant="outline" className="rounded-xl h-10 px-3.5 font-bold text-[12px] border-primary/30 text-primary hover:bg-primary/10 shadow-sm justify-center">
              <Link href="/admin/contributions">
                <FileSpreadsheet className="mr-1.5 h-4 w-4 shrink-0" /> Bulk Upload (Excel)
              </Link>
            </Button>
          )}
          {isManagement && (
            <Button onClick={() => setIsManualEntryOpen(true)} className="rounded-xl h-10 px-4 font-bold text-[12px] shadow-sm justify-center bg-primary text-primary-foreground">
              <Plus className="mr-1.5 h-4 w-4 shrink-0" /> Manual Entry
            </Button>
          )}
        </div>
      </div>

      {/* Professional KPI Financial Card Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Verified Fund / Balance Card */}
        <Card className="border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-background shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-4 sm:p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              {isManagement ? "Total Verified Fund" : "My Verified Balance"}
            </span>
            <Badge variant="outline" className="text-[9px] font-bold uppercase border-primary/30 text-primary bg-primary/5">
              Verified
            </Badge>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0">
            <div data-stat-value="true" className="text-xl sm:text-2xl font-bold font-headline text-foreground tracking-tight whitespace-nowrap">
              {formatCurrency(totalVerifiedBalance, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-normal">
              {isManagement 
                ? "Total cumulative verified savings held in institutional custody" 
                : "Active savings balance qualifying your borrowing power"}
            </p>
          </CardContent>
        </Card>

        {/* Pending Submissions / Queue Card */}
        <Card className="border border-border bg-card shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-4 sm:p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {isManagement ? "Pending Audit Queue" : "Pending Audits"}
            </span>
            {pendingContributions.length > 0 ? (
              <Badge className="bg-primary/10 text-primary border-none text-[9px] font-bold">
                {pendingContributions.length} Pending
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[9px] font-medium text-muted-foreground">
                All Cleared
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0">
            <div data-stat-value="true" className="text-xl sm:text-2xl font-bold font-headline text-foreground whitespace-nowrap">
              {formatCurrency(
                pendingContributions.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0),
                currency
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-normal">
              {pendingContributions.length === 0 
                ? "No deposits currently awaiting management audit"
                : `${pendingContributions.length} submission${pendingContributions.length === 1 ? '' : 's'} awaiting verification`}
            </p>
          </CardContent>
        </Card>

        {/* Ledger Statistics Card */}
        <Card className="border border-border bg-card shadow-sm rounded-xl hidden lg:block">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-4 sm:p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
              Ledger Transactions
            </span>
            <Badge variant="outline" className="text-[9px] font-medium">
              Records
            </Badge>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0">
            <div data-stat-value="true" className="text-xl sm:text-2xl font-bold font-headline text-foreground">
              {contributions.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-normal">
              {verifiedContributions.length} verified &bull; {reversedContributions.length} reversed
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 w-full min-w-0 max-w-full">
        <div className="lg:col-span-1 space-y-6 w-full min-w-0 max-w-full">
          {!isManagement ? (
            <Card className="border-primary/20 bg-primary/5 h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Upload className="h-5 w-5" /> Submit Savings
                </CardTitle>
                <CardDescription>Upload proof of your monthly deposit</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitContribution} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="period">Target Month</Label>
                    <Select name="period" defaultValue={selectedPeriod}>
                      <SelectTrigger className="h-11 rounded-xl bg-background border-primary/10"><SelectValue placeholder="Select Month" /></SelectTrigger>
                      <SelectContent>
                        {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Contribution Amount</Label>
                    <div className="relative">
                      <Input name="amount" type="number" defaultValue={defaultAmount} required className="h-11 rounded-xl pr-14 bg-background border-primary/10 font-bold" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground uppercase">
                        {currency}
                      </div>
                    </div>
                    {/* Deposit bank details displayed below amount */}
                    {(settings.depositBankName || settings.depositAccountNumber) && (
                      <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-primary min-w-0">
                          <Landmark className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium text-[11px] text-muted-foreground">Deposit Bank:</span>
                          <strong className="text-foreground truncate">{settings.depositBankName || 'Designated Bank'}</strong>
                        </div>
                        {settings.depositAccountNumber && (
                          <div className="font-mono font-bold text-xs text-foreground bg-background px-2 py-0.5 rounded border border-border shrink-0">
                            {settings.depositAccountNumber}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proofFile">Proof of Payment</Label>
                    <div className="flex flex-col gap-2">
                      <Input name="proofFile" type="file" required className="rounded-xl h-11 py-2 bg-background border-primary/10" />
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> Upload screenshot or bank receipt
                      </p>
                    </div>
                  </div>
                  <Button className="w-full h-11 rounded-xl font-bold shadow-lg" type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit for Verification
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-none shadow-lg h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Clock className="h-5 w-5" /> Awaiting Audit
                </CardTitle>
                <CardDescription>Verify these member submissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingContributions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground italic text-sm">
                    All clear. No pending audits.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingContributions.map((c: any) => (
                      <div key={c.id} className="p-4 border rounded-xl bg-muted/20 flex flex-col gap-2 hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs">{getMemberName(c.memberId)}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">{c.period}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-primary">{formatCurrency(c.amount, currency)}</span>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-[11px] font-bold"
                            onClick={() => { setSelectedContribution(c); setIsVerifyOpen(true); }}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" /> Review
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6 lg:col-span-2 w-full min-w-0 max-w-full">
          <Tabs defaultValue="history" onValueChange={setActiveTab} className="w-full min-w-0 max-w-full">
            <div className="w-full overflow-x-auto no-scrollbar pb-1">
              <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-5 h-11 rounded-xl bg-muted/50 p-1 mb-4 sm:mb-6 border border-border">
                <TabsTrigger value="history" className="rounded-lg font-bold text-[11px] uppercase tracking-wider px-3 whitespace-nowrap">History</TabsTrigger>
                <TabsTrigger value="pending" className="rounded-lg font-bold text-[11px] uppercase tracking-wider px-3 whitespace-nowrap">Pending</TabsTrigger>
                <TabsTrigger value="verified" className="rounded-lg font-bold text-[11px] uppercase tracking-wider px-3 whitespace-nowrap">Verified</TabsTrigger>
                <TabsTrigger value="reversed" className="rounded-lg font-bold text-[11px] uppercase tracking-wider px-3 whitespace-nowrap">Reversed</TabsTrigger>
                <TabsTrigger value="rejected" className="rounded-lg font-bold text-[11px] uppercase tracking-wider px-3 whitespace-nowrap">Rejected</TabsTrigger>
              </TabsList>
            </div>

            <Card className="border border-border shadow-md bg-card rounded-2xl overflow-hidden w-full min-w-0 max-w-full">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/5 p-3.5 sm:p-5">
                <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
                   <History className="h-4 w-4" /> {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Record
                </CardTitle>
                <span className="text-[10px] text-muted-foreground sm:hidden font-medium">
                  Swipe table &rarr;
                </span>
              </CardHeader>
              <CardContent className="p-0 w-full min-w-0 max-w-full overflow-hidden">
                <TabsContent value="history" className="m-0 w-full min-w-0">{renderTable(contributions)}</TabsContent>
                <TabsContent value="pending" className="m-0 w-full min-w-0">{renderTable(pendingContributions)}</TabsContent>
                <TabsContent value="verified" className="m-0 w-full min-w-0">{renderTable(verifiedContributions)}</TabsContent>
                <TabsContent value="reversed" className="m-0 w-full min-w-0">{renderTable(reversedContributions)}</TabsContent>
                <TabsContent value="rejected" className="m-0 w-full min-w-0">{renderTable(rejectedContributions)}</TabsContent>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </div>

      {/* Manual Entry Dialog (Management) */}
      <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleManualRecord}>
            <DialogHeader>
              <DialogTitle>Manual Contribution Entry</DialogTitle>
              <DialogDescription>Officially record a payment from a member ledger.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="space-y-2">
                <Label>Select Member</Label>
                <Select name="memberId" required>
                  <SelectTrigger className="h-11 rounded-xl bg-muted border-none">
                    <SelectValue placeholder="Search member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.email})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input name="amount" type="number" defaultValue={defaultAmount} required className="h-11 rounded-xl bg-muted border-none" />
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select name="period" defaultValue={selectedPeriod}>
                    <SelectTrigger className="h-11 rounded-xl bg-muted border-none">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Audit Justification</Label>
                <Textarea name="justification" placeholder="E.g., Cash received at meeting..." required className="rounded-xl min-h-[90px] bg-muted border-none" />
              </div>
            </div>
            <DialogFooter>
               <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-bold shadow-lg">
                 {isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <ShieldCheck className="h-5 w-5 mr-2" />}
                 Post to Ledger
               </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVerifyOpen} onOpenChange={setIsVerifyOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          {isManagement ? (
            <form onSubmit={(e) => {
              const submitter = (e.nativeEvent as any).submitter.value;
              handleActionContribution(submitter === 'verify' ? 'verify' : 'reject', e);
            }}>
              <DialogHeader>
                <DialogTitle>Audit Verification</DialogTitle>
                <DialogDescription>Review submission for {selectedContribution ? getMemberName(selectedContribution.memberId) : 'the member'}.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-6">
                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Stated Amount:</span>
                    <span className="font-bold text-lg">{selectedContribution ? formatCurrency(selectedContribution.amount, currency) : '-'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Applied Period:</span>
                    <span className="font-bold">{selectedContribution?.period}</span>
                  </div>
                  {selectedContribution?.proofUrl && (
                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="w-full text-[11px] h-9 rounded-lg font-bold bg-white" asChild>
                        <a href={selectedContribution.proofUrl} target="_blank" rel="noopener noreferrer">
                          <FileText className="mr-2 h-4 w-4" /> View Payment Evidence
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="justification" className="flex items-center gap-1">
                    Compliance Notes / Rejection Reason <ShieldCheck className="h-3 w-3 text-primary" />
                  </Label>
                  <Textarea 
                    name="justification" 
                    placeholder="Provide details for verification or reason for rejection..." 
                    required 
                    className="rounded-xl min-h-[90px] bg-muted border-none" 
                  />
                </div>
              </div>
              <DialogFooter className="flex gap-2">
                <Button 
                  className="flex-1 h-11 rounded-xl font-bold bg-destructive hover:bg-destructive/90 text-white shadow-lg shadow-destructive/20" 
                  type="submit" 
                  name="action" 
                  value="reject" 
                  disabled={isSubmitting}
                >
                  <Ban className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button 
                  className="flex-1 h-11 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200" 
                  type="submit" 
                  name="action" 
                  value="verify" 
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Verify Funds
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-6 py-4">
              <DialogHeader>
                <DialogTitle className="text-destructive flex items-center gap-2">
                  <Ban className="h-5 w-5" /> Submission Rejected
                </DialogTitle>
                <DialogDescription>Your contribution for {selectedContribution?.period} was not verified.</DialogDescription>
              </DialogHeader>
              
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-2">
                 <p className="text-[10px] font-bold uppercase text-destructive tracking-widest">Reason for Rejection</p>
                 <p className="text-sm font-medium italic">"{selectedContribution?.rejectionReason || 'No reason provided.'}"</p>
              </div>

              <div className="bg-muted/30 p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Original Amount:</span>
                  <span className="font-bold">{selectedContribution ? formatCurrency(selectedContribution.amount, currency) : '-'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button className="w-full h-11 rounded-xl font-bold shadow-lg" onClick={() => {
                  setSelectedContribution(null);
                  setIsVerifyOpen(false);
                  toast({ title: "Ready for Re-submission", description: "Please use the form to submit corrected details." });
                }}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Prepare New Submission
                </Button>
                <Button variant="ghost" className="w-full h-11 rounded-xl font-medium" onClick={() => setIsVerifyOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* REVERSE CONTRIBUTION APPROVAL DIALOG (Management) */}
      <Dialog open={isReverseOpen} onOpenChange={setIsReverseOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" /> Reverse Contribution Approval
            </DialogTitle>
            <DialogDescription>
              Reverse verified contribution of <strong>{selectedContribution ? formatCurrency(selectedContribution.amount, currency) : ''}</strong> for <strong>{selectedContribution ? getMemberName(selectedContribution.memberId) : 'member'}</strong> ({selectedContribution?.period}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted rounded-xl border border-border text-xs text-foreground space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-foreground shrink-0" />
                Financial &amp; Balance Impact
              </p>
              <p>
                Reversing this approval sets status to <code>reversed</code>. The credited amount will be deducted from the member&apos;s verified savings balance and their borrowing capacity will be adjusted immediately.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                Reversal Justification / Audit Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={reversalJustification}
                onChange={(e) => setReversalJustification(e.target.value)}
                placeholder="e.g. Duplicate bank transfer recorded in error, corrected deduction per HR notice..."
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsReverseOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isReversing}
              onClick={handleReverseContribution}
              className="rounded-xl font-bold text-xs gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md"
            >
              {isReversing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
