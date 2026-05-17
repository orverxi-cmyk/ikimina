'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Info } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection, useDoc } from '@/firebase/firestore/hooks';
import { collection, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter, differenceInDays } from 'date-fns';

export default function LoansPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: userData } = useDoc(user ? doc(firestore, 'users', user.uid) : null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  const role = userData?.role || 'member';
  const isManagement = role === 'admin' || role === 'management';

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

  // Calculations
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
      // Example: 1% penalty per week late (simplified to 0.15% per day)
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

  const handleUpdateStatus = async (loanId: string, status: 'approved' | 'rejected') => {
    try {
      const updates: any = { status };
      if (status === 'approved') {
        // Set due date to 3 months from now by default
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + 3);
        updates.dueDate = Timestamp.fromDate(dueDate);
      }
      await updateDoc(doc(firestore, 'loans', loanId), updates);
      toast({ title: "Loan Updated", description: `Loan has been ${status}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update loan." });
    }
  };

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Unknown';

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Management</h1>
          <p className="text-muted-foreground">Track requests, approvals and repayments</p>
        </div>
        
        <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Request Loan
            </Button>
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
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600 uppercase tracking-wider">Active Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.active.toLocaleString()} RWF</div>
          </CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600 uppercase tracking-wider">Overdue Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.overdue.toLocaleString()} RWF</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-600 uppercase tracking-wider">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.requested.toLocaleString()} RWF</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loan Directory</CardTitle>
          <CardDescription>
            {isManagement ? "Overview of all member loans" : "History of your personal loans"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Repayment</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Penalty</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLoans ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No loan records found.
                  </TableCell>
                </TableRow>
              ) : (
                loans.map((loan: any) => {
                  const penalty = calculatePenalty(loan);
                  const progress = loan.status === 'approved' ? Math.round(((loan.amount - loan.balance) / loan.amount) * 100) : 0;
                  const isOverdue = loan.status === 'approved' && loan.dueDate && isAfter(new Date(), loan.dueDate.toDate());

                  return (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">
                        {isManagement ? getMemberName(loan.memberId) : "My Loan"}
                        {loan.description && (
                          <div className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">
                            {loan.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{loan.amount?.toLocaleString()} RWF</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "capitalize border-none",
                          loan.status === 'approved' && !isOverdue ? 'bg-green-500/10 text-green-600' : 
                          loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                          isOverdue ? 'bg-orange-500/10 text-orange-600' : 'bg-secondary'
                        )}>
                          {isOverdue ? 'Overdue' : loan.status}
                        </Badge>
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
                      <TableCell className="text-sm">
                        {loan.dueDate ? format(loan.dueDate.toDate(), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-destructive font-bold">
                        {penalty > 0 ? `+${penalty.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {isManagement && loan.status === 'requested' ? (
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600 border-green-500/20 hover:bg-green-500/10"
                              onClick={() => handleUpdateStatus(loan.id, 'approved')}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-destructive border-destructive/20 hover:bg-destructive/10"
                              onClick={() => handleUpdateStatus(loan.id, 'rejected')}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" disabled>
                            <Info className="h-4 w-4" />
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
