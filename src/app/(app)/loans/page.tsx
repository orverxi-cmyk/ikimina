'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, Loader2, FileText, Upload, AlertTriangle } from 'lucide-react';
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
import { generateAmortizationSchedule } from '@/lib/loan-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function LoansPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  const [interestType, setInterestType] = useState<'immediate' | 'afterward'>('afterward');

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  
  // All active members can request loans
  const canRequestLoan = !!user && userData?.status === 'active';

  const loansQuery = useMemoFirebase(() => {
    if (!user) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [user, isManagement]);

  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), []);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: membersSnap } = useCollection(membersQuery);

  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);

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
    if (!user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    const loanData = {
      memberId: user.uid,
      amount,
      balance: amount,
      status: 'requested',
      requestDate: serverTimestamp(),
      description,
      penaltyAmount: 0,
      penaltyRate: 0.0015,
      interestAmount: 0,
      interestType: 'afterward',
    };

    addDoc(collection(firestore, 'loans'), loanData)
      .then(() => {
        toast({ title: "Request Sent", description: "Your loan request has been submitted for management review." });
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
    const penaltyRate = Number(formData.get('penaltyRate')) / 100;
    const durationMonths = Number(formData.get('duration')) || 3;
    const startDateRaw = formData.get('startDate') as string;

    try {
      let checkUrl = '';
      if (checkFile && checkFile.size > 0) {
        const fileRef = ref(storage, `loan_checks/${selectedLoan.id}/${checkFile.name}`);
        await uploadBytes(fileRef, checkFile);
        checkUrl = await getDownloadURL(fileRef);
      }

      const batch = writeBatch(firestore);
      const startDate = new Date(startDateRaw || new Date());
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + durationMonths);

      const interestTotal = interestType === 'afterward' ? interestAmount : 0;
      const totalBalance = selectedLoan.amount + interestTotal;

      const schedule = generateAmortizationSchedule(selectedLoan.amount, interestTotal, durationMonths, startDate);

      batch.update(doc(firestore, 'loans', selectedLoan.id), {
        status: 'approved',
        startDate: Timestamp.fromDate(startDate),
        dueDate: Timestamp.fromDate(dueDate),
        checkUrl,
        interestAmount,
        interestType,
        penaltyRate,
        balance: totalBalance,
        durationMonths,
        amortization: schedule,
        approvedAt: serverTimestamp(),
      });

      batch.update(doc(firestore, 'users', selectedLoan.memberId), {
        amortizationSchedule: schedule.map(s => ({
          ...s,
          dueDate: Timestamp.fromDate(s.dueDate)
        }))
      });

      await batch.commit();
      toast({ title: "Loan Approved", description: "Schedule generated and terms applied." });
      setIsApproveOpen(false);
      setSelectedLoan(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval Failed", description: error.message });
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
          return { 
            ...inst, 
            status: 'paid', 
            proofUrl, 
            paidAt: new Date() 
          };
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

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Portfolio</h1>
          <p className="text-muted-foreground">Repayment schedules and debt management</p>
        </div>
        
        {canRequestLoan && (
          <Button onClick={() => setIsRequestOpen(true)} className="rounded-xl shadow-lg shadow-primary/20 h-11 px-6">
            <Plus className="mr-2 h-4 w-4" /> Request New Loan
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-green-500/5 border-green-500/10 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Active Books</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.active.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-orange-500/5 border-orange-500/10 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-orange-700 uppercase tracking-widest">Overdue</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{stats.overdue.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/10 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">In Pipeline</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.requested.toLocaleString()} RWF</div></CardContent>
        </Card>
      </div>

      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleRequestLoan}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">Loan Request</DialogTitle>
              <DialogDescription>Submit a formal request for capital from the Ikimina fund.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="space-y-2">
                <Label>Requested Amount (RWF)</Label>
                <Input name="amount" type="number" placeholder="500000" required className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Purpose / Justification</Label>
                <Textarea name="description" placeholder="Briefly explain the use of funds..." required className="rounded-xl min-h-[100px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="rounded-2xl">
          <form onSubmit={handleRepayInstallment}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">Installment #{selectedInstallment}</DialogTitle>
              <DialogDescription>Upload proof of transaction to verify your payment.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="space-y-2">
                <Label>Payment Amount (RWF)</Label>
                <Input 
                  name="amount" 
                  type="number" 
                  defaultValue={selectedLoan?.amortization?.find((i: any) => i.installmentNumber === selectedInstallment)?.amount || 0} 
                  required 
                  className="h-11 rounded-xl" 
                />
              </div>
              <div className="space-y-2">
                <Label>Transaction Proof (Image/PDF)</Label>
                <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-accent cursor-pointer transition-colors relative">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Select file or scan receipt</span>
                  <Input name="proofFile" type="file" accept="image/*,.pdf" required className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">Approve Loan</DialogTitle>
              <DialogDescription>Generate the binding amortization schedule.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Applicant:</span>
                  <span className="font-bold">{selectedLoan && getMemberName(selectedLoan.memberId)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Principal:</span>
                  <span className="font-bold">{selectedLoan?.amount?.toLocaleString()} RWF</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input name="startDate" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Months</Label>
                  <Input name="duration" type="number" defaultValue="3" min="1" required className="h-11 rounded-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interest Timing</Label>
                <Select value={interestType} onValueChange={(v: any) => setInterestType(v)}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="afterward">Added to Balance (Afterward)</SelectItem>
                    <SelectItem value="immediate">Deducted from Payout (Immediate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Interest (RWF)</Label>
                  <Input name="interestAmount" type="number" defaultValue="25000" required className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Daily Penalty (%)</Label>
                  <Input name="penaltyRate" type="number" step="0.01" defaultValue="0.15" required className="h-11 rounded-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Upload Disbursed Check Scan</Label>
                <Input name="checkFile" type="file" accept="image/*" required className="rounded-xl" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve & Execute
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/10">
          <CardTitle className="text-xl">Loan Directory</CardTitle>
          <CardDescription>Comprehensive tracking of active debt and pending reviews</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/5">
              <TableRow>
                <TableHead className="py-4 px-6">{isManagement ? "Member Standing" : "Purpose"}</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Repayment Progress</TableHead>
                <TableHead>Amortization Schedule</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground h-8 w-8" /></TableCell></TableRow>
              ) : loans.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No loans recorded in this jurisdiction.</TableCell></TableRow>
              ) : (
                loans.map((loan: any) => {
                  const totalInitial = loan.interestType === 'afterward' ? (loan.amount + (loan.interestAmount || 0)) : loan.amount;
                  const progress = loan.status === 'approved' ? Math.min(100, Math.round(((totalInitial - loan.balance) / totalInitial) * 100)) : 0;
                  const penalty = calculatePenalty(loan);

                  return (
                    <TableRow key={loan.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="py-4 px-6 align-top">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-bold text-lg">{isManagement ? getMemberName(loan.memberId) : (loan.description || "Personal Loan")}</span>
                          <Badge variant="outline" className={cn(
                            "w-fit text-[10px] uppercase font-bold",
                            loan.status === 'approved' ? "text-green-600 border-green-200" :
                            loan.status === 'requested' ? "text-blue-600 border-blue-200" : "text-muted-foreground"
                          )}>
                            {loan.status}
                          </Badge>
                          {penalty > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-orange-600 font-bold mt-1 bg-orange-500/10 p-1.5 rounded-lg w-fit">
                              <AlertTriangle className="h-3.5 w-3.5" /> Penalty Applied: {penalty.toLocaleString()} RWF
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top font-bold pt-6">{loan.amount?.toLocaleString()} RWF</TableCell>
                      <TableCell className="w-[180px] align-top pt-6">
                        {loan.status === 'approved' ? (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span>{progress}% Repaid</span>
                              <span>{loan.balance?.toLocaleString()} left</span>
                            </div>
                            <Progress value={progress} className="h-2 rounded-full" />
                          </div>
                        ) : loan.status === 'completed' ? (
                          <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
                             <CheckCircle2 className="h-4 w-4" /> Fully Repaid
                          </div>
                        ) : <span className="text-muted-foreground text-xs italic">Review pending</span>}
                      </TableCell>
                      <TableCell className="py-4">
                        {loan.amortization ? (
                          <div className="grid gap-2 min-w-[240px]">
                            {loan.amortization.map((inst: any) => {
                              const d = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
                              const isOverdue = inst.status !== 'paid' && isAfter(new Date(), d);
                              const isLoanOwner = loan.memberId === user?.uid;
                              
                              return (
                                <div key={inst.installmentNumber} className={cn(
                                  "flex items-center justify-between text-[11px] p-2.5 rounded-xl border transition-all",
                                  inst.status === 'paid' ? "bg-green-500/5 border-green-200/50 opacity-60" : 
                                  isOverdue ? "bg-orange-500/5 border-orange-200" : "bg-muted/40 border-transparent"
                                )}>
                                  <div className="flex flex-col">
                                    <span className="font-bold">Inst. #{inst.installmentNumber} • {format(d, 'MMM d, yyyy')}</span>
                                    <span className="text-muted-foreground font-medium">{inst.amount.toLocaleString()} RWF</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {inst.status === 'paid' ? (
                                      <span className="text-green-600 font-bold uppercase text-[9px]">Verified</span>
                                    ) : (
                                      isLoanOwner && (
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg"
                                          onClick={() => { setSelectedLoan(loan); setSelectedInstallment(inst.installmentNumber); setIsRepayOpen(true); }}
                                        >
                                          Repay Now
                                        </Button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <span className="text-muted-foreground italic text-xs">Waiting for terms approval</span>}
                      </TableCell>
                      <TableCell className="text-right align-top px-6 pt-6">
                        <div className="flex justify-end gap-2">
                          {isManagement && loan.status === 'requested' && (
                            <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }} className="rounded-xl font-bold px-4">
                               Approve
                            </Button>
                          )}
                          {loan.checkUrl && (
                            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" asChild>
                              <a href={loan.checkUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /></a>
                            </Button>
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
    </div>
  );
}
