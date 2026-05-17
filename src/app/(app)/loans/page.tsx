
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, XCircle, Loader2, FileText, Upload, Wallet, Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollection, useDoc } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, Timestamp, increment, writeBatch } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter, differenceInDays } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateAmortizationSchedule } from '@/lib/loan-utils';

export default function LoansPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { user } = useUser();
  const { data: userData } = useDoc(user ? doc(firestore, 'users', user.uid) : null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  const [interestType, setInterestType] = useState<'immediate' | 'afterward'>('afterward');

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  const isMember = role === 'member';

  const loansQuery = useMemo(() => {
    if (!user) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [firestore, user, isManagement]);

  const membersQuery = useMemo(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), [firestore]);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: membersSnap } = useCollection(membersQuery);

  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);

  const stats = useMemo(() => {
    const now = new Date();
    return loans.reduce((acc, loan: any) => {
      const amount = Number(loan.amount) || 0;
      const balance = Number(loan.balance) || 0;
      const isOverdue = loan.status === 'approved' && loan.dueDate && isAfter(now, loan.dueDate.toDate());

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

  const handleRequestLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    try {
      await addDoc(collection(firestore, 'loans'), {
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
      });
      toast({ title: "Request Sent", description: "Your loan request has been submitted." });
      setIsRequestOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to submit request." });
    } finally {
      setIsSubmitting(false);
    }
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
    const startDate = startDateRaw ? new Date(startDateRaw) : new Date();

    try {
      let checkUrl = '';
      if (checkFile && checkFile.size > 0) {
        const fileRef = ref(storage, `loan_checks/${selectedLoan.id}/${checkFile.name}`);
        await uploadBytes(fileRef, checkFile);
        checkUrl = await getDownloadURL(fileRef);
      }

      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + durationMonths);

      const interestTotal = interestType === 'afterward' ? interestAmount : 0;
      const principal = selectedLoan.amount;
      const totalBalance = principal + interestTotal;

      const schedule = generateAmortizationSchedule(principal, interestTotal, durationMonths, startDate);

      const batch = writeBatch(firestore);
      
      // Update Loan Doc
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

      // Update User Doc with current active schedule
      batch.update(doc(firestore, 'users', selectedLoan.memberId), {
        amortizationSchedule: schedule.map(s => ({
          ...s,
          dueDate: Timestamp.fromDate(s.dueDate)
        }))
      });

      await batch.commit();

      toast({ title: "Loan Approved", description: "Schedule generated and saved." });
      setIsApproveOpen(false);
      setSelectedLoan(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to approve loan." });
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

      const updatedAmortization = selectedLoan.amortization.map((inst: any) => {
        if (inst.installmentNumber === selectedInstallment) {
          return { ...inst, status: 'paid', proofUrl, paidAt: new Date() };
        }
        return inst;
      });

      const batch = writeBatch(firestore);
      
      // Update Loan Doc
      batch.update(doc(firestore, 'loans', selectedLoan.id), {
        balance: increment(-amount),
        amortization: updatedAmortization
      });

      // Update User Doc
      batch.update(doc(firestore, 'users', selectedLoan.memberId), {
        amortizationSchedule: updatedAmortization.map((s: any) => ({
          ...s,
          dueDate: s.dueDate instanceof Timestamp ? s.dueDate : Timestamp.fromDate(new Date(s.dueDate)),
          paidAt: s.paidAt ? Timestamp.fromDate(new Date(s.paidAt)) : null
        }))
      });

      // Record Repayment Entry
      await addDoc(collection(firestore, 'repayments'), {
        loanId: selectedLoan.id,
        memberId: user.uid,
        amount,
        installmentNumber: selectedInstallment,
        proofUrl,
        date: serverTimestamp(),
        status: 'pending'
      });

      await batch.commit();

      toast({ title: "Repayment Sent", description: "Installment recorded successfully." });
      setIsRepayOpen(false);
      setSelectedLoan(null);
      setSelectedInstallment(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to record repayment." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Unknown';

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Management</h1>
          <p className="text-muted-foreground">Repayment schedules, installments, and amortization</p>
        </div>
        
        {isMember && (
          <Button onClick={() => setIsRequestOpen(true)}><Plus className="mr-2 h-4 w-4" /> Request Loan</Button>
        )}
      </div>

      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent>
          <form onSubmit={handleRequestLoan}>
            <DialogHeader>
              <DialogTitle>Loan Request</DialogTitle>
              <DialogDescription>Submit a request for a loan from the Ikimina App funds.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Requested Amount (RWF)</Label>
                <Input name="amount" type="number" placeholder="500000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Purpose of Loan</Label>
                <Textarea name="description" placeholder="Briefly describe why you need this loan..." required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Repayment Dialog */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent>
          <form onSubmit={handleRepayInstallment}>
            <DialogHeader>
              <DialogTitle>Confirm Installment Payment</DialogTitle>
              <DialogDescription>Installment #{selectedInstallment}. Upload proof of payment.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Installment Amount (RWF)</Label>
                <Input name="amount" type="number" defaultValue={selectedLoan?.amortization?.find((i: any) => i.installmentNumber === selectedInstallment)?.amount || 0} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proofFile">Proof of Payment (Image/PDF)</Label>
                <Input name="proofFile" type="file" accept="image/*,.pdf" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload Proof
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle>Approve & Generate Schedule</DialogTitle>
              <DialogDescription>Set terms and generate amortization schedule.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="bg-primary/5 p-3 rounded-lg border border-primary/10 text-sm space-y-1">
                <p><strong>Member:</strong> {selectedLoan && getMemberName(selectedLoan.memberId)}</p>
                <p><strong>Principal:</strong> {selectedLoan?.amount?.toLocaleString()} RWF</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input name="startDate" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required />
                </div>
                <div className="space-y-2">
                  <Label>Duration (Months)</Label>
                  <Input name="duration" type="number" defaultValue="3" min="1" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interest Timing</Label>
                <Select value={interestType} onValueChange={(v: any) => setInterestType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="afterward">Added to Balance</SelectItem>
                    <SelectItem value="immediate">Deducted from Payout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Interest (RWF)</Label>
                  <Input name="interestAmount" type="number" defaultValue="25000" required />
                </div>
                <div className="space-y-2">
                  <Label>Daily Penalty (%)</Label>
                  <Input name="penaltyRate" type="number" step="0.01" defaultValue="0.15" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Upload Check Scan</Label>
                <Input name="checkFile" type="file" accept="image/*" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Active Portfolio</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.active.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overdue Balance</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-600">{stats.overdue.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pending Requests</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.requested.toLocaleString()} RWF</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Loan Directory & Amortization</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isManagement ? "Member" : "Purpose"}</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : loans.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No loans found.</TableCell></TableRow>
              ) : (
                loans.map((loan: any) => {
                  const totalInitial = loan.interestType === 'afterward' ? (loan.amount + (loan.interestAmount || 0)) : loan.amount;
                  const progress = loan.status === 'approved' ? Math.round(((totalInitial - loan.balance) / totalInitial) * 100) : 0;

                  return (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium align-top">
                        {isManagement ? getMemberName(loan.memberId) : (loan.description || "Loan")}
                        <div className="text-xs text-muted-foreground mt-1">Status: {loan.status}</div>
                      </TableCell>
                      <TableCell className="align-top">{loan.amount?.toLocaleString()} RWF</TableCell>
                      <TableCell className="w-[150px] align-top">
                        {loan.status === 'approved' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span>{progress}%</span>
                              <span>{loan.balance?.toLocaleString()} left</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {loan.amortization ? (
                          <div className="space-y-2 min-w-[200px]">
                            {loan.amortization.map((inst: any) => {
                              const d = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
                              return (
                                <div key={inst.installmentNumber} className="flex items-center justify-between text-[11px] p-2 bg-muted/50 rounded-lg">
                                  <span>#{inst.installmentNumber} - {format(d, 'MMM d, yyyy')}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">{inst.amount.toLocaleString()} RWF</span>
                                    {inst.status === 'paid' ? (
                                      <Badge variant="outline" className="bg-green-500/10 text-green-600 text-[10px] px-1 py-0 border-green-500/20">PAID</Badge>
                                    ) : (
                                      isMember && loan.memberId === user?.uid && (
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-6 px-2 text-[10px] text-primary"
                                          onClick={() => { setSelectedLoan(loan); setSelectedInstallment(inst.installmentNumber); setIsRepayOpen(true); }}
                                        >
                                          Confirm Payment
                                        </Button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <span className="text-muted-foreground italic text-xs">Waiting for approval...</span>}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {isManagement && loan.status === 'requested' && (
                           <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }}>
                             Approve
                           </Button>
                        )}
                        {loan.checkUrl && (
                          <Button variant="ghost" size="icon" asChild>
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
    </div>
  );
}
