'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Loader2, 
  FileText, 
  CreditCard, 
  History as HistoryIcon, 
  ShieldCheck, 
  HandCoins, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Eye, 
  Ban,
  Calendar,
  Landmark
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, doc, serverTimestamp, orderBy, where, Timestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isPast } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { recordRepaymentAction, verifyRepaymentAction } from '@/lib/finance-client';
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
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isVerifyRepayOpen, setIsVerifyRepayOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('schedule');

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

  // Derived data for tabs
  const activeLoans = useMemo(() => loans.filter((l: any) => l.status === 'approved'), [loans]);
  const historyLoans = useMemo(() => loans.filter((l: any) => l.status === 'approved' || l.status === 'rejected' || l.status === 'completed'), [loans]);
  
  const missedInstallments = useMemo(() => {
    const missed: any[] = [];
    loans.forEach((loan: any) => {
      if (loan.status === 'approved' && loan.amortization) {
        loan.amortization.forEach((inst: any) => {
          const dueDate = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
          if (inst.status === 'pending' && isPast(dueDate)) {
            missed.push({ ...inst, loanId: loan.id, description: loan.description, memberId: loan.memberId });
          }
        });
      }
    });
    return missed;
  }, [loans]);

  const interestSummary = useMemo(() => {
    const gained = userData?.accruedInterest || 0;
    const paid = loans
      .filter((l: any) => l.status === 'approved' || l.status === 'completed')
      .reduce((acc, l: any) => acc + (l.interestAmount || 0), 0);
    return { gained, paid };
  }, [userData, loans]);

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

  const getStatusBadge = (dueDate: any, status: string) => {
    const d = dueDate instanceof Timestamp ? dueDate.toDate() : new Date(dueDate);
    if (status === 'paid') return <Badge variant="default" className="bg-green-600 border-none px-3 font-bold uppercase text-[9px]">Paid</Badge>;
    if (isPast(d)) return <Badge variant="destructive" className="animate-pulse px-3 font-bold uppercase text-[9px]">Arrears</Badge>;
    return <Badge variant="secondary" className="px-3 font-bold uppercase text-[9px]">Pending</Badge>;
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Lending & Capital</h1>
          <p className="text-muted-foreground font-medium">Manage borrowing cycles and repayment schedules</p>
        </div>
        <div className="flex gap-2">
           <div className="bg-primary/10 px-4 py-2 rounded-xl border border-primary/20 text-center">
              <p className="text-[10px] font-bold text-primary uppercase tracking-tighter">Gained Interest</p>
              <p className="text-sm font-bold text-green-600">+{formatCurrency(interestSummary.gained, currency)}</p>
           </div>
           <div className="bg-orange-500/10 px-4 py-2 rounded-xl border border-orange-500/20 text-center">
              <p className="text-[10px] font-bold text-orange-600 uppercase tracking-tighter">Interest Paid</p>
              <p className="text-sm font-bold text-orange-600">-{formatCurrency(interestSummary.paid, currency)}</p>
           </div>
        </div>
      </div>

      <Tabs defaultValue="schedule" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 rounded-2xl bg-muted/50 p-1.5 mb-8">
          <TabsTrigger value="schedule" className="rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
            <Calendar className="h-4 w-4" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
            <HistoryIcon className="h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger value="interest" className="rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
            <Landmark className="h-4 w-4" /> Interest
          </TabsTrigger>
          <TabsTrigger value="arrears" className="rounded-xl font-bold text-xs uppercase tracking-widest gap-2 relative">
            <AlertTriangle className="h-4 w-4" /> Arrears
            {missedInstallments.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white animate-bounce">
                {missedInstallments.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-6">
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <HandCoins className="h-5 w-5 text-primary" /> Active Repayment Windows
              </CardTitle>
              <CardDescription>Upcoming installments for all your approved capital loans.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Installment</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Due Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Target Amount</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                    {!isManagement && <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-widest">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLoans ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : activeLoans.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No active schedules found.</TableCell></TableRow>
                  ) : (
                    activeLoans.flatMap((loan: any) => (
                      loan.amortization?.map((inst: any) => (
                        <TableRow key={`${loan.id}-${inst.installmentNumber}`} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-6 py-4">
                            <div className="font-bold">#{inst.installmentNumber}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">{loan.description || 'Personal Loan'}</div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {format(inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="font-bold text-primary">{formatCurrency(inst.amount, currency)}</TableCell>
                          <TableCell>{getStatusBadge(inst.dueDate, inst.status)}</TableCell>
                          {!isManagement && (
                            <TableCell className="text-right px-6">
                              {inst.status === 'pending' && (
                                <Button size="sm" className="h-8 rounded-lg font-bold" onClick={() => { setSelectedLoan(loan); setIsRepayOpen(true); }}>
                                  <CreditCard className="mr-2 h-3.5 w-3.5" /> Pay Now
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
             <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-xl">Loan Lifecycle Audit</CardTitle>
              <CardDescription>Comprehensive record of all requested, approved, and rejected loans.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Purpose</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Principal</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Interest</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                    <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-widest">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLoans ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : historyLoans.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No historical records.</TableCell></TableRow>
                  ) : (
                    historyLoans.map((loan: any) => (
                      <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="px-6 py-4">
                           <div className="font-bold">{loan.description || 'Capital Loan'}</div>
                           <div className="text-[10px] text-muted-foreground">{format(loan.requestDate?.toDate() || new Date(), 'MMM d, yyyy')}</div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(loan.amount, currency)}</TableCell>
                        <TableCell className="text-xs text-orange-600 font-bold">+{formatCurrency(loan.interestAmount || 0, currency)}</TableCell>
                        <TableCell>
                           <Badge variant={loan.status === 'rejected' ? 'destructive' : 'outline'} className="uppercase font-bold text-[9px]">
                             {loan.status}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-right px-6 font-bold text-primary">{formatCurrency(loan.balance || 0, currency)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interest" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-none shadow-lg bg-green-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <TrendingUp className="h-5 w-5" /> Interest Gained
                </CardTitle>
                <CardDescription>Dividends accrued from the global pool pro-rata.</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="text-4xl font-bold text-green-600">{formatCurrency(interestSummary.gained, currency)}</div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Verified Earnings</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg bg-orange-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <TrendingDown className="h-5 w-5" /> Interest Paid
                </CardTitle>
                <CardDescription>Total interest overhead committed on loans.</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="text-4xl font-bold text-orange-600">{formatCurrency(interestSummary.paid, currency)}</div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Cumulative Liability</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="arrears" className="space-y-6">
          <Card className="border-destructive/20 shadow-xl bg-destructive/5 rounded-3xl overflow-hidden">
            <CardHeader className="bg-destructive/10 border-b border-destructive/20">
              <CardTitle className="text-xl flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Arrears & Missed Windows
              </CardTitle>
              <CardDescription className="text-destructive/80 font-medium">Urgent: Installments that have exceeded their contractual due date.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                <TableHeader className="bg-destructive/5">
                  <TableRow>
                    <TableHead className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-destructive">Source Loan</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-destructive">Missed Due Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-destructive">Arrears Amount</TableHead>
                    {!isManagement && <TableHead className="text-right px-6 text-[10px] font-bold uppercase tracking-widest text-destructive">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missedInstallments.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic font-medium">Great news! You have no arrears.</TableCell></TableRow>
                  ) : (
                    missedInstallments.map((inst: any, idx: number) => (
                      <TableRow key={idx} className="bg-destructive/10 hover:bg-destructive/20 transition-colors border-destructive/10">
                        <TableCell className="px-6 py-4 font-bold text-destructive">
                           {inst.description || 'Personal Loan'}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-destructive">
                           {format(inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-bold text-destructive">{formatCurrency(inst.amount, currency)}</TableCell>
                        {!isManagement && (
                          <TableCell className="text-right px-6">
                             <Button size="sm" variant="destructive" className="h-8 rounded-lg font-bold shadow-lg" onClick={() => { 
                               const loan = loans.find(l => l.id === inst.loanId);
                               setSelectedLoan(loan); 
                               setIsRepayOpen(true); 
                             }}>
                                Clear Arrears
                             </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* REPAYMENT DIALOG (Common for all tabs) */}
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
    </div>
  );
}
