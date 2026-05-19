
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, Loader2, FileText, Upload, AlertTriangle, Info, Wallet, Calculator } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, doc, serverTimestamp, orderBy, where, Timestamp, writeBatch, increment } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter, differenceInDays } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { rejectLoanAction, approveLoanAction } from '@/lib/finance-client';
import { formatCurrency } from '@/lib/currency';

export default function LoansPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'financials'), []);
  const { data: settingsData } = useDoc(settingsRef);
  const currency = settingsData?.currency || 'RWF';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  const [interestType, setInterestType] = useState<'immediate' | 'afterward'>('immediate');
  const [tempInterestAmount, setTempInterestAmount] = useState<number>(0);

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  
  const loansQuery = useMemoFirebase(() => {
    if (!user) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [user, isManagement]);

  const contributionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid));
  }, [user]);

  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), []);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: contributionsSnap } = useCollection(contributionsQuery);
  const { data: membersSnap } = useCollection(membersQuery);

  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);

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

  const stats = useMemo(() => {
    const now = new Date();
    return loans.reduce((acc, loan: any) => {
      const amount = Number(loan.amount) || 0;
      const balance = Number(loan.balance) || 0;
      const isOverdue = loan.status === 'approved' && loan.dueDate && isAfter(now, loan.dueDate.toDate()) && balance > 0;

      if (loan.status === 'approved') {
        acc.active += balance;
      }
      if (isOverdue) {
        acc.overdue += balance;
      }
      if (loan.status === 'requested') {
        acc.requested += amount;
      }
      return acc;
    }, { active: 0, overdue: 0, requested: 0 });
  }, [loans]);

  const handleRequestLoan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || hasActiveOrPendingLoan) return;
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    if (amount < (settingsData?.minLoanAmount || 1)) {
      toast({ 
        variant: "destructive", 
        title: "Below Minimum", 
        description: `Minimum allowed loan is ${formatCurrency(settingsData?.minLoanAmount || 1, currency)}.` 
      });
      setIsSubmitting(false);
      return;
    }

    if (amount > maxBorrowAmount) {
      toast({ 
        variant: "destructive", 
        title: "Limit Exceeded", 
        description: `Your borrowing limit is ${formatCurrency(maxBorrowAmount, currency)}.` 
      });
      setIsSubmitting(false);
      return;
    }

    const loanData = {
      memberId: user.uid,
      amount,
      balance: amount,
      status: 'requested',
      requestDate: serverTimestamp(),
      description,
      penaltyRate: 0.0015,
      interestAmount: 0,
      interestType: 'immediate',
    };

    addDoc(collection(firestore, 'loans'), loanData)
      .then(() => {
        toast({ title: "Request Sent", description: "Your loan request has been submitted." });
        setIsRequestOpen(false);
      })
      .catch((err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'loans',
          operation: 'create'
        }));
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleApproveLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !isManagement) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const checkFile = formData.get('checkFile') as File;
    const interestAmount = Number(formData.get('interestAmount'));
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
        interestType,
        penaltyRate,
        durationMonths,
        startDate: startDateRaw || new Date().toISOString(),
        checkUrl
      };

      await approveLoanAction({
        loanId: selectedLoan.id,
        terms,
        justification
      });

      toast({ title: "Loan Approved", description: "Loan terms applied and schedule generated." });
      setIsApproveOpen(false);
      setSelectedLoan(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !isManagement) return;
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      await rejectLoanAction({ loanId: selectedLoan.id, justification });
      toast({ title: "Loan Rejected", description: "The request has been denied." });
      setIsRejectOpen(false);
      setSelectedLoan(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRepayInstallment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !user || selectedInstallment === null) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const proofFile = formData.get('proofFile') as File;

    try {
      let proofUrl = '';
      if (proofFile && proofFile.size > 0) {
        const fileRef = ref(storage, `repayment_proofs/${user.uid}/${selectedLoan.id}_inst_${selectedInstallment}/${proofFile.name}`);
        await uploadBytes(fileRef, proofFile);
        proofUrl = await getDownloadURL(fileRef);
      }

      const batch = writeBatch(firestore);
      const updatedAmortization = selectedLoan.amortization.map((inst: any) => {
        if (inst.installmentNumber === selectedInstallment) {
          return { ...inst, status: 'paid', proofUrl, paidAt: new Date() };
        }
        return inst;
      });

      batch.update(doc(firestore, 'loans', selectedLoan.id), {
        balance: increment(-amount),
        amortization: updatedAmortization,
      });

      batch.update(doc(firestore, 'users', selectedLoan.memberId), {
        amortizationSchedule: updatedAmortization.map((s: any) => ({
          ...s,
          dueDate: s.dueDate instanceof Timestamp ? s.dueDate : Timestamp.fromDate(new Date(s.dueDate)),
          paidAt: s.paidAt ? Timestamp.fromDate(new Date(s.paidAt)) : null
        }))
      });

      const repaymentRef = doc(collection(firestore, 'repayments'));
      batch.set(repaymentRef, {
        loanId: selectedLoan.id,
        memberId: selectedLoan.memberId,
        amount,
        installmentNumber: selectedInstallment,
        proofUrl,
        date: serverTimestamp(),
        status: 'pending'
      });

      await batch.commit();
      toast({ title: "Proof Uploaded", description: "Payment recorded successfully." });
      setIsRepayOpen(false);
      setSelectedLoan(null);
      setSelectedInstallment(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Member';

  const calculatePenalty = (loan: any) => {
    if (!loan.dueDate || loan.balance <= 0) return 0;
    const now = new Date();
    const dueDate = loan.dueDate.toDate();
    if (isAfter(now, dueDate)) {
      const days = differenceInDays(now, dueDate);
      return Math.round(loan.balance * (loan.penaltyRate || 0.0015) * days);
    }
    return 0;
  };

  const netDisbursedDisplay = useMemo(() => {
    if (!selectedLoan) return 0;
    if (interestType === 'immediate') {
      return selectedLoan.amount - tempInterestAmount;
    }
    return selectedLoan.amount;
  }, [selectedLoan, interestType, tempInterestAmount]);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Portfolio</h1>
          <p className="text-muted-foreground font-medium">Manage and track Ikimina borrowing</p>
        </div>
        
        <Button 
          onClick={() => setIsRequestOpen(true)} 
          className="rounded-xl shadow-lg shadow-primary/20 h-11 px-6 font-bold"
          disabled={!canRequestLoan}
        >
          <Plus className="mr-2 h-4 w-4" /> Request New Loan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-card border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Active Balance</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(stats.active, currency)}</div></CardContent>
        </Card>
        <Card className="bg-card border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-orange-700 uppercase tracking-widest">Overdue</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.overdue, currency)}</div></CardContent>
        </Card>
        <Card className="bg-card border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(stats.requested, currency)}</div></CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/10">
          <CardTitle className="text-xl">Directory</CardTitle>
          <CardDescription>Track active and requested capital</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/5">
              <TableRow>
                <TableHead className="py-4 px-6">{isManagement ? "Member" : "Details"}</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Repayment Progress</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground h-8 w-8" /></TableCell></TableRow>
              ) : loans.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No records found.</TableCell></TableRow>
              ) : (
                loans.map((loan: any) => {
                  const totalRepay = loan.interestType === 'afterward' ? (loan.amount + (loan.interestAmount || 0)) : loan.amount;
                  const progress = loan.status === 'approved' ? Math.min(100, Math.round(((totalRepay - loan.balance) / totalRepay) * 100)) : 0;
                  const penalty = calculatePenalty(loan);

                  return (
                    <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold">{isManagement ? getMemberName(loan.memberId) : (loan.description || "Personal Loan")}</span>
                          <Badge variant="outline" className={cn(
                            "w-fit text-[9px] font-bold uppercase",
                            loan.status === 'approved' ? "text-green-600" : loan.status === 'requested' ? "text-blue-600" : "text-muted-foreground"
                          )}>{loan.status}</Badge>
                          {penalty > 0 && <span className="text-[9px] text-orange-600 font-bold">Penalty: {formatCurrency(penalty, currency)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(loan.amount, currency)}</TableCell>
                      <TableCell className="w-[180px]">
                        {loan.status === 'approved' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span>{progress}% Paid</span>
                              <span>{formatCurrency(loan.balance, currency)} Left</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        ) : <span className="text-muted-foreground text-[10px] italic">No active schedule</span>}
                      </TableCell>
                      <TableCell>
                        {loan.amortization ? (
                          <div className="grid gap-1">
                            {loan.amortization.map((inst: any) => {
                              const d = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
                              const isLoanOwner = loan.memberId === user?.uid;
                              return (
                                <div key={inst.installmentNumber} className={cn(
                                  "flex items-center justify-between text-[10px] p-2 border rounded-lg",
                                  inst.status === 'paid' ? "bg-green-500/5 opacity-60" : "bg-background"
                                )}>
                                  <span className="font-medium">#{inst.installmentNumber} • {format(d, 'MMM d')}</span>
                                  {inst.status !== 'paid' && isLoanOwner && (
                                    <Button 
                                      size="sm" variant="ghost" className="h-6 px-2 text-[9px] font-bold"
                                      onClick={() => { setSelectedLoan(loan); setSelectedInstallment(inst.installmentNumber); setIsRepayOpen(true); }}
                                    >Pay</Button>
                                  )}
                                  {inst.status === 'paid' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                                </div>
                              );
                            })}
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">Review Pending</span>}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        {isManagement && loan.status === 'requested' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }} className="h-8">Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => { setSelectedLoan(loan); setIsRejectOpen(true); }} className="h-8 text-destructive">Reject</Button>
                          </div>
                        )}
                        {loan.checkUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={loan.checkUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /></a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleRequestLoan}>
            <DialogHeader>
              <DialogTitle>Request Capital</DialogTitle>
              <DialogDescription>Apply for capital based on your contributions.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Max Borrowing power</p>
                <p className="text-xl font-bold">{formatCurrency(maxBorrowAmount, currency)}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" required className="rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Purpose</Label>
                <Textarea id="description" name="description" required className="rounded-xl" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl">Submit Request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle>Approve & Disburse</DialogTitle>
              <DialogDescription>Define terms for {selectedLoan ? getMemberName(selectedLoan.memberId) : 'Member'}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-200">
                <p className="text-[10px] uppercase font-bold text-blue-600 mb-1">Requested Capital</p>
                <p className="text-xl font-bold">{formatCurrency(selectedLoan?.amount || 0, currency)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Interest Model</Label>
                  <Select value={interestType} onValueChange={(v: any) => setInterestType(v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Discounted (Deduct Now)</SelectItem>
                      <SelectItem value="afterward">Added-on (Pay Later)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>One-off Interest</Label>
                  <Input name="interestAmount" type="number" onChange={(e) => setTempInterestAmount(Number(e.target.value))} required className="rounded-xl" />
                </div>
              </div>

              <div className="bg-green-500/5 p-3 rounded-xl border border-green-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-bold text-green-700">Net Disbursed Amount</span>
                </div>
                <span className="text-lg font-bold text-green-700">{formatCurrency(netDisbursedDisplay, currency)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Duration (Months)</Label>
                  <Input name="duration" type="number" defaultValue="3" required className="rounded-xl" />
                </div>
                <div className="grid gap-2">
                  <Label>Penalty Rate (% Day)</Label>
                  <Input name="penaltyRate" type="number" step="0.01" defaultValue="0.15" required className="rounded-xl" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Start Date</Label>
                <Input name="startDate" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required className="rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label>Audit Justification</Label>
                <Textarea name="justification" placeholder="E.g. Approved by board meeting..." required className="rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label>Check Proof (Upload)</Label>
                <Input name="checkFile" type="file" className="rounded-xl" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl">Execute Disbursement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleRejectLoan}>
            <DialogHeader>
              <DialogTitle>Deny Request</DialogTitle>
              <DialogDescription>Provide a reason for the denial.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Justification</Label>
              <Textarea name="justification" required placeholder="Reason for rejection..." className="rounded-xl" />
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={isSubmitting} className="w-full rounded-xl">Confirm Rejection</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleRepayInstallment}>
            <DialogHeader>
              <DialogTitle>Upload Repayment Proof</DialogTitle>
              <DialogDescription>Recording payment for installment #{selectedInstallment}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Amount Paid</Label>
              <Input name="amount" type="number" required className="rounded-xl" />
              <Label>Proof (Image/PDF)</Label>
              <Input name="proofFile" type="file" required className="rounded-xl" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl">Submit Proof</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
