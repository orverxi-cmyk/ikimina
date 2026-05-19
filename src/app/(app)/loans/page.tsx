
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, FileText, CreditCard, History, ShieldCheck, ArrowRight, Info, Clock, CheckCircle2, Eye, Ban } from 'lucide-react';
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
import { approveLoanAction, recordRepaymentAction, verifyRepaymentAction } from '@/lib/finance-client';
import { formatCurrency } from '@/lib/currency';

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
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isVerifyRepayOpen, setIsVerifyRepayOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [calcAmount, setCalcAmount] = useState<number>(0);

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  
  const loansQuery = useMemoFirebase(() => {
    if (!user || userDataLoading || !userData) return null;
    if (isManagement) return query(collection(firestore, 'loans'), orderBy('requestDate', 'desc'));
    return query(collection(firestore, 'loans'), where('memberId', '==', user.uid), orderBy('requestDate', 'desc'));
  }, [user, isManagement, userDataLoading, userData]);

  const repaymentsQuery = useMemoFirebase(() => {
    if (!user || userDataLoading || !isManagement) return null;
    return query(collection(firestore, 'repayments'), where('status', '==', 'pending'), orderBy('date', 'desc'));
  }, [user, isManagement, userDataLoading]);

  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: repaymentsSnap } = useCollection(repaymentsQuery);

  const loans = useMemo(() => loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [loansSnap]);
  const pendingRepayments = useMemo(() => repaymentsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [repaymentsSnap]);

  const handleRepay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('repayAmount'));
    const proofFile = formData.get('proofFile') as File;
    const justification = formData.get('justification') as string;

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
        justification
      });

      toast({ title: "Payment Submitted", description: "Your repayment is awaiting management verification." });
      setIsRepayOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyRepayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRepayment || !isManagement) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      await verifyRepaymentAction({
        repaymentId: selectedRepayment.id,
        justification
      });
      toast({ title: "Repayment Verified", description: "Loan balance has been updated." });
      setIsVerifyRepayOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: error.message });
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
        <Button onClick={() => setIsRequestOpen(true)} className="rounded-xl shadow-lg shadow-primary/20 h-11 px-6 font-bold" disabled={userData?.status !== 'active'}>
          <Plus className="mr-2 h-4 w-4" /> Request New Loan
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/10">
              <CardTitle className="text-xl">Active & Requested Capital</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">Purpose</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Balance</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLoans ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground h-8 w-8" /></TableCell></TableRow>
                  ) : loans.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No loan records found.</TableCell></TableRow>
                  ) : (
                    loans.map((loan: any) => (
                      <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-4 px-6 font-bold">{loan.description || "Personal Loan"}</TableCell>
                        <TableCell className="font-bold text-primary">{formatCurrency(loan.balance, currency)}</TableCell>
                        <TableCell><Badge className="uppercase font-bold text-[9px]">{loan.status}</Badge></TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedLoan(loan); setIsScheduleOpen(true); }} className="h-8 rounded-lg font-bold">
                              <History className="mr-2 h-3.5 w-3.5" /> Schedule
                            </Button>
                            {loan.status === 'approved' && !isManagement && (
                              <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsRepayOpen(true); }} className="h-8 rounded-lg font-bold">
                                <CreditCard className="mr-2 h-3.5 w-3.5" /> Pay
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {isManagement && (
          <div className="space-y-6">
            <Card className="border-none shadow-lg h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary text-lg">
                  <Clock className="h-5 w-5" /> Pending Payments
                </CardTitle>
                <CardDescription>Verify repayments submitted by members</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingRepayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground italic text-sm">All repayments verified.</div>
                ) : (
                  <div className="space-y-3">
                    {pendingRepayments.map((r: any) => (
                      <div key={r.id} className="p-4 border rounded-xl bg-muted/20 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs">Loan #{r.loanId.substring(0,6)}</span>
                          <span className="text-[10px] text-muted-foreground">{format(r.date?.toDate() || new Date(), 'MMM d')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-primary">{formatCurrency(r.amount, currency)}</span>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedRepayment(r); setIsVerifyRepayOpen(true); }} className="h-8 text-[11px] font-bold">
                            <Eye className="mr-1.5 h-3.5 w-3.5" /> Audit
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* VERIFY REPAYMENT DIALOG */}
      <Dialog open={isVerifyRepayOpen} onOpenChange={setIsVerifyRepayOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleVerifyRepayment}>
            <DialogHeader>
              <DialogTitle>Verify Loan Repayment</DialogTitle>
              <DialogDescription>Review payment evidence for loan audit.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Amount Submitted:</span>
                  <span className="font-bold text-lg">{selectedRepayment ? formatCurrency(selectedRepayment.amount, currency) : '-'}</span>
                </div>
                {selectedRepayment?.proofUrl && (
                  <Button variant="outline" size="sm" className="w-full text-[11px] h-9 rounded-lg" asChild>
                    <a href={selectedRepayment.proofUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-2 h-4 w-4" /> View Payment Proof
                    </a>
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Audit Justification</Label>
                <Textarea name="justification" placeholder="Enter reason for verification or rejection..." required className="rounded-xl" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full h-11 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Confirm and Update Balance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REPAYMENT DIALOG */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <form onSubmit={handleRepay}>
            <DialogHeader>
              <DialogTitle className="text-xl">Submit Repayment</DialogTitle>
              <DialogDescription>Submit your payment evidence for management verification.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="space-y-2">
                <Label>Payment Reference / Note</Label>
                <Input name="justification" placeholder="e.g. Bank Transfer #12345" className="h-11 rounded-xl" required />
              </div>

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                 <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Outstanding Balance</p>
                 <p className="text-2xl font-bold text-primary">{formatCurrency(selectedLoan?.balance || 0, currency)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Regular Installment</Label>
                  <div className="h-11 rounded-xl border bg-muted/20 px-3 flex items-center font-bold text-sm">
                    {formatCurrency(selectedLoan?.amortization?.find((i: any) => i.status === 'pending')?.amount || 0, currency)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Payment Amount</Label>
                  <div className="relative">
                    <Input name="repayAmount" type="number" max={selectedLoan?.balance} required className="h-11 rounded-xl pr-12" />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{currency}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase">Proof of Transfer</Label>
                <Input name="proofFile" type="file" required className="h-11 rounded-xl py-2.5 text-xs" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-bold shadow-lg">
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Submit for Verification
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SCHEDULE DIALOG */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <History className="h-5 w-5 text-primary" /> Repayment Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Installment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLoan?.amortization?.map((inst: any) => (
                    <TableRow key={inst.installmentNumber}>
                      <TableCell className="font-bold">#{inst.installmentNumber}</TableCell>
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
    </div>
  );
}
