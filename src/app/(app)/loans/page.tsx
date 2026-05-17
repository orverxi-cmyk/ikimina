
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, XCircle, Clock, Loader2, Info, FileText, Upload, ExternalLink, History } from 'lucide-react';
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
import { useCollection, useDoc } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, Timestamp, increment } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter, differenceInDays } from 'date-fns';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';
  const isMember = role === 'member';

  // Firestore Queries
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

  // Stats
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

  const calculatePenalty = (loan: any) => {
    if (loan.status !== 'approved' || !loan.dueDate) return 0;
    const now = new Date();
    const dueDate = loan.dueDate.toDate();
    if (isAfter(now, dueDate)) {
      const daysLate = differenceInDays(now, dueDate);
      return Math.floor(loan.amount * 0.0015 * daysLate);
    }
    return 0;
  };

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
      });
      toast({ title: "Request Sent", description: "Your loan request has been submitted for approval." });
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

    try {
      let checkUrl = '';
      if (checkFile && checkFile.size > 0) {
        const fileRef = ref(storage, `loan_checks/${selectedLoan.id}/${checkFile.name}`);
        await uploadBytes(fileRef, checkFile);
        checkUrl = await getDownloadURL(fileRef);
      }

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 3);

      await updateDoc(doc(firestore, 'loans', selectedLoan.id), {
        status: 'approved',
        dueDate: Timestamp.fromDate(dueDate),
        checkUrl,
      });

      toast({ title: "Loan Approved", description: "Loan has been approved and check recorded." });
      setIsApproveOpen(false);
      setSelectedLoan(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to approve loan." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRepayLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan || !user) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const proofFile = formData.get('proofFile') as File;

    try {
      let proofUrl = '';
      if (proofFile && proofFile.size > 0) {
        const fileRef = ref(storage, `repayment_proofs/${user.uid}/${selectedLoan.id}/${proofFile.name}`);
        await uploadBytes(fileRef, proofFile);
        proofUrl = await getDownloadURL(fileRef);
      }

      await addDoc(collection(firestore, 'repayments'), {
        loanId: selectedLoan.id,
        memberId: user.uid,
        amount,
        proofUrl,
        date: serverTimestamp(),
        status: 'pending'
      });

      // Optimistically update balance (In a real app, this might wait for verification)
      await updateDoc(doc(firestore, 'loans', selectedLoan.id), {
        balance: increment(-amount),
      });

      toast({ title: "Repayment Sent", description: "Repayment proof uploaded successfully." });
      setIsRepayOpen(false);
      setSelectedLoan(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to upload repayment proof." });
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
          <p className="text-muted-foreground">
            {isManagement ? "Track requests, approvals and repayments" : "Manage my personal loans"}
          </p>
        </div>
        
        {isMember && (
          <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Request Loan</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleRequestLoan}>
                <DialogHeader>
                  <DialogTitle>Loan Request</DialogTitle>
                  <DialogDescription>Submit a request for a loan from the Tontine funds.</DialogDescription>
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
        )}
      </div>

      {/* Repayment Dialog */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent>
          <form onSubmit={handleRepayLoan}>
            <DialogHeader>
              <DialogTitle>Record Repayment</DialogTitle>
              <DialogDescription>Enter installment amount and upload proof of payment.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Repayment Amount (RWF)</Label>
                <Input name="amount" type="number" placeholder="50000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proofFile">Proof of Payment (Image/PDF)</Label>
                <Input name="proofFile" type="file" accept="image/*,.pdf" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Repayment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent>
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle>Approve Loan</DialogTitle>
              <DialogDescription>Verify the request and upload the check image to finalize approval.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Loan Details</Label>
                <div className="text-sm border p-3 rounded bg-muted">
                  <p><strong>Member:</strong> {selectedLoan && getMemberName(selectedLoan.memberId)}</p>
                  <p><strong>Amount:</strong> {selectedLoan?.amount?.toLocaleString()} RWF</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkFile">Upload Check Image</Label>
                <Input name="checkFile" type="file" accept="image/*" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Approval
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600 uppercase tracking-wider">{isManagement ? "Active Portfolio" : "My Active Loans"}</CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.active.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600 uppercase tracking-wider">Overdue Balance</CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-600">{stats.overdue.toLocaleString()} RWF</div></CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-600 uppercase tracking-wider">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.requested.toLocaleString()} RWF</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Loan Directory</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isManagement ? "Member" : "Purpose"}</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check</TableHead>
                <TableHead>Repayment</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow><TableCell colSpan={7} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : loans.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No loans found.</TableCell></TableRow>
              ) : (
                loans.map((loan: any) => {
                  const penalty = calculatePenalty(loan);
                  const progress = loan.status === 'approved' ? Math.round(((loan.amount - loan.balance) / loan.amount) * 100) : 0;
                  const isOverdue = loan.status === 'approved' && loan.dueDate && isAfter(new Date(), loan.dueDate.toDate());

                  return (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">
                        {isManagement ? getMemberName(loan.memberId) : (loan.description || "General Loan")}
                        {penalty > 0 && <div className="text-[10px] text-destructive font-bold">Penalty: +{penalty.toLocaleString()} RWF</div>}
                      </TableCell>
                      <TableCell>{loan.amount?.toLocaleString()} RWF</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "capitalize",
                          loan.status === 'approved' && !isOverdue ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                          loan.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          isOverdue ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-secondary'
                        )}>
                          {isOverdue ? 'Overdue' : loan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {loan.checkUrl ? (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={loan.checkUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /></a>
                          </Button>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="w-[150px]">
                        {loan.status === 'approved' ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{progress}%</span>
                              <span>{loan.balance?.toLocaleString()} left</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {loan.dueDate ? format(loan.dueDate.toDate(), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {isManagement && loan.status === 'requested' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-green-600"
                                onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-destructive"
                                onClick={async () => {
                                  if (confirm("Reject this loan?")) await updateDoc(doc(firestore, 'loans', loan.id), { status: 'rejected' });
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {isMember && loan.status === 'approved' && loan.balance > 0 && (
                            <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsRepayOpen(true); }}>
                              <Upload className="h-4 w-4 mr-1" /> Repay
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

