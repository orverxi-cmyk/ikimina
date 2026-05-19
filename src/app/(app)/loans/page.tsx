'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, FileText, Wallet, Calculator, ShieldCheck, Lock, Landmark, History, CreditCard, AlertCircle, Info, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, doc, serverTimestamp, orderBy, where, Timestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isPast } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { approveLoanAction, recordRepaymentAction } from '@/lib/finance-client';
import { formatCurrency } from '@/lib/currency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoansPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData } = useDoc(settingsRef);
  const currency = settingsData?.currency || 'RWF';
  const globalInterestRate = settingsData?.loanInterestRate || 0;
  const globalInterestModel = settingsData?.interestModel || 'one-off';
  const globalInterestType = settingsData?.interestType || 'immediate';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [calcAmount, setCalcAmount] = useState<number>(0);
  const [interestAmount, setInterestAmount] = useState<number>(0);

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  const isLoading = userDataLoading;
  
  const loansQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [user, isManagement, isLoading, userData]);

  const contributionsQuery = useMemoFirebase(() => {
    if (!user || isLoading || !userData) return null;
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user, isLoading, userData]);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: contributionsSnap } = useCollection(contributionsQuery);

  const loans = useMemo(() => {
    return loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [loansSnap]);

  const userTotalContributions = useMemo(() => {
    return contributionsSnap?.docs.reduce((acc, d) => acc + (Number(d.data().amount) || 0), 0) || 0;
  }, [contributionsSnap]);

  const maxBorrowAmount = useMemo(() => {
    const percentage = (settingsData?.maxLoanPercentage || 80) / 100;
    const calcLimit = Math.floor(userTotalContributions * percentage);
    const globalMax = settingsData?.maxLoanAmount || 1000000;
    return Math.min(calcLimit, globalMax);
  }, [userTotalContributions, settingsData]);

  const hasActiveOrPendingLoan = useMemo(() => {
    return loans.some((l: any) => l.memberId === user?.uid && (l.status === 'requested' || l.status === 'approved'));
  }, [loans, user]);

  const canRequestLoan = !!user && userData?.status === 'active' && !hasActiveOrPendingLoan;

  useEffect(() => {
    let amount = calcAmount;
    if (selectedLoan && isApproveOpen) amount = selectedLoan.amount;
    
    if (amount > 0 && globalInterestRate > 0) {
      setInterestAmount(Math.round(amount * (globalInterestRate / 100)));
    } else {
      setInterestAmount(0);
    }
  }, [calcAmount, selectedLoan, isApproveOpen, globalInterestRate]);

  const handleRequestLoan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || hasActiveOrPendingLoan) return;
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    if (amount < (settingsData?.minLoanAmount || 1)) {
      toast({ variant: "destructive", title: "Below Minimum", description: `Minimum allowed loan is ${formatCurrency(settingsData?.minLoanAmount || 1, currency)}.` });
      setIsSubmitting(false);
      return;
    }

    if (amount > maxBorrowAmount) {
      toast({ variant: "destructive", title: "Limit Exceeded", description: `Your borrowing limit is ${formatCurrency(maxBorrowAmount, currency)}.` });
      setIsSubmitting(false);
      return;
    }

    addDoc(collection(firestore, 'loans'), {
      memberId: user.uid,
      amount,
      balance: amount,
      status: 'requested',
      requestDate: serverTimestamp(),
      description,
      penaltyRate: 0.0015,
      interestRate: globalInterestRate,
      interestModel: globalInterestModel,
      interestType: globalInterestType,
      interestAmount: interestAmount,
    })
      .then(() => {
        toast({ title: "Request Sent", description: "Your loan request has been submitted." });
        setIsRequestOpen(false);
      })
      .catch((err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'loans', operation: 'create', requestResourceData: { amount, description } }));
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleApproveLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !isManagement) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const checkFile = formData.get('checkFile') as File;
    const penaltyRate = (Number(formData.get('penaltyRate')) || 0.15) / 100;
    const durationMonths = Number(formData.get('duration')) || 3;
    const startDateRaw = formData.get('startDate') as string;
    const justification = formData.get('justification') as string;

    try {
      let checkUrl = '';
      if (checkFile && checkFile.size > 0) {
        const fileRef = ref(storage, `loan_checks/${selectedLoan.id}/${checkFile.name}`);
        await uploadBytes(fileRef, checkFile);
        checkUrl = await getDownloadURL(fileRef);
      }

      const terms = {
        interestAmount,
        interestType: globalInterestType,
        interestModel: globalInterestModel,
        interestRate: globalInterestRate,
        penaltyRate,
        durationMonths,
        startDate: startDateRaw || new Date().toISOString(),
        checkUrl
      };

      await approveLoanAction({ loanId: selectedLoan.id, terms, justification });
      toast({ title: "Loan Approved", description: "Loan terms applied and schedule generated." });
      setIsApproveOpen(false);
      setSelectedLoan(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRepay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('repayAmount'));
    const proofFile = formData.get('proofFile') as File;
    const justification = formData.get('justification') as string;

    if (amount > selectedLoan.balance) {
      toast({ variant: "destructive", title: "Amount Exceeded", description: "You cannot pay more than the outstanding balance." });
      setIsSubmitting(false);
      return;
    }

    try {
      let proofUrl = '';
      if (proofFile && proofFile.size > 0) {
        const fileRef = ref(storage, `repayment_proofs/${user.uid}/${selectedLoan.id}_${Date.now()}_${proofFile.name}`);
        await uploadBytes(fileRef, proofFile);
        proofUrl = await getDownloadURL(fileRef);
      }

      await recordRepaymentAction({
        loanId: selectedLoan.id,
        amount,
        proofUrl,
        justification: justification || `Payment submitted by ${userData?.name}`
      });

      toast({ title: "Payment Recorded", description: "Your repayment has been logged and balance updated." });
      setIsRepayOpen(false);
      setSelectedLoan(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Payment Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusLabel = (dueDate: any, status: string) => {
    const d = dueDate instanceof Timestamp ? dueDate.toDate() : new Date(dueDate);
    if (status === 'paid') return <Badge variant="default" className="bg-green-600 border-none px-3">Paid</Badge>;
    if (isPast(d)) return <Badge variant="destructive" className="animate-pulse px-3">Arrears</Badge>;
    return <Badge variant="secondary" className="px-3">Pending</Badge>;
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Portfolio</h1>
          <p className="text-muted-foreground font-medium">Manage and track Ikimina borrowing</p>
        </div>
        <Button onClick={() => setIsRequestOpen(true)} className="rounded-xl shadow-lg shadow-primary/20 h-11 px-6 font-bold" disabled={!canRequestLoan}>
          <Plus className="mr-2 h-4 w-4" /> Request New Loan
        </Button>
      </div>

      <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/10">
          <CardTitle className="text-xl">Active & Requested Capital</CardTitle>
          <CardDescription>Directory of all credit movements</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/5">
              <TableRow>
                <TableHead className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">Member / Purpose</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Principal</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Balance</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground h-8 w-8" /></TableCell></TableRow>
              ) : loans.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No loan records found.</TableCell></TableRow>
              ) : (
                loans.map((loan: any) => {
                  const totalRepay = loan.interestType === 'afterward' ? (loan.amount + (loan.interestAmount || 0)) : loan.amount;
                  const progress = loan.status === 'approved' ? Math.min(100, Math.round(((totalRepay - loan.balance) / totalRepay) * 100)) : 0;
                  return (
                    <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-bold">{loan.description || "Personal Loan"}</span>
                          <span className="text-[10px] text-muted-foreground">ID: {loan.id.substring(0, 8)}...</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(loan.amount, currency)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 w-32">
                           <span className="font-bold text-primary">{formatCurrency(loan.balance, currency)}</span>
                           {loan.status === 'approved' && <Progress value={progress} className="h-1" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "uppercase font-bold text-[9px] px-2.5 border-none",
                          loan.status === 'approved' ? "bg-green-500/10 text-green-600" :
                          loan.status === 'requested' ? "bg-blue-500/10 text-blue-600" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {loan.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex justify-end gap-2">
                          {isManagement && loan.status === 'requested' && (
                            <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }} className="rounded-lg font-bold">Review & Approve</Button>
                          )}
                          {loan.status === 'approved' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => { setSelectedLoan(loan); setIsScheduleOpen(true); }} className="h-8 rounded-lg font-bold">
                                <History className="mr-2 h-3.5 w-3.5" /> Schedule
                              </Button>
                              {!isManagement && (
                                <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsRepayOpen(true); }} className="h-8 rounded-lg bg-primary font-bold shadow-lg shadow-primary/20">
                                  <CreditCard className="mr-2 h-3.5 w-3.5" /> Pay
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* REPAYMENT DIALOG */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <form onSubmit={handleRepay}>
            <DialogHeader>
              <DialogTitle className="text-xl">Submit Repayment</DialogTitle>
              <DialogDescription>Submit your payment evidence for audit verification.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="space-y-2">
                <Label htmlFor="justification">Payment Reference / Note</Label>
                <Input 
                  id="justification" 
                  name="justification" 
                  placeholder="e.g. Bank Transfer #12345" 
                  className="h-11 rounded-xl"
                  required
                />
              </div>

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-1">
                 <p className="text-[10px] font-bold text-muted-foreground uppercase">Outstanding Balance</p>
                 <p className="text-2xl font-bold text-primary">{formatCurrency(selectedLoan?.balance || 0, currency)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repayAmount">Payment Amount</Label>
                <div className="relative">
                  <Input 
                    id="repayAmount" 
                    name="repayAmount" 
                    type="number" 
                    max={selectedLoan?.balance} 
                    required 
                    className="h-11 rounded-xl pr-14" 
                    placeholder="Enter amount..."
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{currency}</div>
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Custom amount allowed up to total balance.</p>
              </div>

              <div className="space-y-2">
                <Label>Proof of Transfer / Receipt</Label>
                <Input name="proofFile" type="file" required className="h-11 rounded-xl py-2.5" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20">
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SCHEDULE DIALOG */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="max-w-2xl rounded-2xl overflow-hidden">
          <DialogHeader className="bg-muted/10 p-6 pb-4 -mx-6 -mt-6 border-b">
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <History className="h-5 w-5 text-primary" /> Repayment Schedule
                </DialogTitle>
                <DialogDescription>Installment planning and arrears tracking for loan ID: {selectedLoan?.id.substring(0, 8)}</DialogDescription>
              </div>
              {!isManagement && selectedLoan?.balance > 0 && (
                <Button size="sm" onClick={() => { setIsScheduleOpen(false); setIsRepayOpen(true); }} className="rounded-lg shadow-md font-bold">
                  <CreditCard className="mr-2 h-4 w-4" /> Quick Pay
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-primary/5 p-4 rounded-xl mb-6 flex justify-between items-center border border-primary/10">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Outstanding Capital</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(selectedLoan?.balance || 0, currency)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Terms</p>
                <p className="text-sm font-bold">{selectedLoan?.durationMonths} Months / {selectedLoan?.interestRate}% Rate</p>
              </div>
            </div>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Installment</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Due Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLoan?.amortization?.map((inst: any) => (
                    <TableRow key={inst.installmentNumber} className="hover:bg-muted/20">
                      <TableCell className="font-bold py-3">#{inst.installmentNumber}</TableCell>
                      <TableCell className="text-sm">
                        {format(inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-bold text-primary">{formatCurrency(inst.amount, currency)}</TableCell>
                      <TableCell className="text-right pr-6">
                        {getStatusLabel(inst.dueDate, inst.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* LOAN APPROVAL DIALOG */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle className="text-xl">Loan Approval & Disbursement</DialogTitle>
              <DialogDescription>Establish the final legal terms and generated repayment schedule.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-200">
                <p className="text-[10px] uppercase font-bold text-blue-600 mb-1">Requested Principal</p>
                <p className="text-xl font-bold">{formatCurrency(selectedLoan?.amount || 0, currency)}</p>
              </div>

              <div className="bg-muted/50 p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-wider"><Lock className="h-3 w-3" /> System Locked Rates</div>
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <div className="space-y-1"><span className="text-muted-foreground font-medium">Interest Model</span><Badge variant="outline" className="w-full justify-center capitalize py-1 text-[9px] font-bold">{globalInterestModel}</Badge></div>
                  <div className="space-y-1"><span className="text-muted-foreground font-medium">Interest Rate</span><Badge variant="outline" className="w-full justify-center py-1 text-[9px] font-bold">{globalInterestRate}%</Badge></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Duration (Months)</Label>
                  <Input name="duration" type="number" defaultValue="3" required className="rounded-xl h-11" />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Penalty (% Day)</Label>
                  <Input name="penaltyRate" type="number" step="0.01" defaultValue="0.15" required className="rounded-xl h-11" />
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Audit Justification</Label>
                <Textarea name="justification" placeholder="Provide reason for approval..." required className="rounded-xl min-h-[60px]" />
              </div>
              
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Proof of Disbursement</Label>
                <Input name="checkFile" type="file" className="rounded-xl h-11 py-2.5" />
                <p className="text-[9px] text-muted-foreground">Upload scanned check or bank transfer receipt.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl h-12 font-bold shadow-lg shadow-primary/20">
                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Execute Disbursement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* LOAN REQUEST DIALOG */}
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleRequestLoan}>
            <DialogHeader>
              <DialogTitle className="text-xl">Loan Capital Request</DialogTitle>
              <DialogDescription>Eligibility is verified against your saved contribution wealth.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex justify-between items-center">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 tracking-widest">Max Borrowing Capacity</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(maxBorrowAmount, currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium text-muted-foreground">Based on 80% limit</p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Requested Principal Amount</Label>
                <div className="relative">
                  <Input id="amount" name="amount" type="number" required className="rounded-xl h-11 pr-14" onChange={(e) => setCalcAmount(Number(e.target.value))} />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{currency}</div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Capital Purpose / Justification</Label>
                <Textarea id="description" name="description" required className="rounded-xl min-h-[90px]" placeholder="E.g. Working capital for retail business expansion..." />
              </div>
              
              <div className="p-3 bg-muted/30 rounded-xl flex gap-3">
                 <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                 <p className="text-[10px] leading-relaxed text-muted-foreground">
                   By submitting, you agree to the fixed {globalInterestRate}% interest rate and the standard Tontine terms as defined in the global financial policy.
                 </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl h-12 font-bold shadow-lg shadow-primary/20">
                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Submit Formal Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
