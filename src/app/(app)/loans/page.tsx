
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2, Loader2, FileText, Upload, AlertTriangle, Info, Wallet, Calculator, ShieldCheck, Lock } from 'lucide-react';
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
  const globalInterestRate = settingsData?.loanInterestRate || 0;
  const globalInterestModel = settingsData?.interestModel || 'one-off';
  const globalInterestType = settingsData?.interestType || 'immediate';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  
  const [calcAmount, setCalcAmount] = useState<number>(0);
  const [interestAmount, setInterestAmount] = useState<number>(0);

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

  // Real-time interest calculation based on global policy
  useEffect(() => {
    let amount = calcAmount;
    if (selectedLoan && isApproveOpen) amount = selectedLoan.amount;
    
    if (amount > 0 && globalInterestRate > 0) {
      if (globalInterestModel === 'one-off') {
        setInterestAmount(Math.round(amount * (globalInterestRate / 100)));
      } else {
        // For monthly/yearly, we just default to the rate for now as a display
        // The backend handles the actual duration-based math during disbursement if needed
        setInterestAmount(Math.round(amount * (globalInterestRate / 100)));
      }
    } else {
      setInterestAmount(0);
    }
  }, [calcAmount, selectedLoan, isApproveOpen, globalInterestRate, globalInterestModel]);

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
      // Pass the global policy at time of request for transparency
      interestRate: globalInterestRate,
      interestModel: globalInterestModel,
      interestType: globalInterestType,
      interestAmount: interestAmount,
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
        interestAmount, // Calculated from global policy, UI is locked
        interestType: globalInterestType,
        interestModel: globalInterestModel,
        interestRate: globalInterestRate,
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

  const netDisbursedDisplay = useMemo(() => {
    if (!selectedLoan) return 0;
    if (globalInterestType === 'immediate') {
      return selectedLoan.amount - interestAmount;
    }
    return selectedLoan.amount;
  }, [selectedLoan, globalInterestType, interestAmount]);

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

      <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/10 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Directory</CardTitle>
            <CardDescription>Track active and requested capital</CardDescription>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-200">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase">Policy: {globalInterestRate}% ({globalInterestModel})</span>
          </div>
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
                  return (
                    <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold">{isManagement ? (members.find(m => m.id === loan.memberId)?.name || 'Member') : (loan.description || "Personal Loan")}</span>
                          <Badge variant="outline" className={cn(
                            "w-fit text-[9px] font-bold uppercase",
                            loan.status === 'approved' ? "text-green-600" : loan.status === 'requested' ? "text-blue-600" : "text-muted-foreground"
                          )}>{loan.status}</Badge>
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
                            {loan.amortization.slice(0, 2).map((inst: any) => (
                                <div key={inst.installmentNumber} className="text-[9px] text-muted-foreground">
                                    #{inst.installmentNumber}: {format(inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate), 'MMM d')}
                                </div>
                            ))}
                            {loan.amortization.length > 2 && <span className="text-[9px] text-muted-foreground">...</span>}
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">Review Pending</span>}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        {isManagement && loan.status === 'requested' && (
                          <Button size="sm" onClick={() => { setSelectedLoan(loan); setIsApproveOpen(true); }} className="h-8">Approve</Button>
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

      {/* Request Loan Dialog */}
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleRequestLoan}>
            <DialogHeader>
              <DialogTitle>Request Capital</DialogTitle>
              <DialogDescription>Your eligibility is based on total contributions.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex justify-between items-center">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Max Borrowing power</p>
                  <p className="text-xl font-bold">{formatCurrency(maxBorrowAmount, currency)}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total Savings</p>
                    <p className="text-sm font-bold">{formatCurrency(userTotalContributions, currency)}</p>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="amount">Requested Amount</Label>
                <Input 
                  id="amount" 
                  name="amount" 
                  type="number" 
                  required 
                  className="rounded-xl h-11" 
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                />
              </div>

              {/* Locked Policy Display */}
              <div className="bg-muted/50 p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Lock className="h-3 w-3" /> Locked Financial Policy
                </div>
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Interest Rate:</span>
                    <p className="font-bold">{globalInterestRate}% ({globalInterestModel})</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expected Interest:</span>
                    <p className="font-bold text-primary">{formatCurrency(interestAmount, currency)}</p>
                  </div>
                </div>
                <p className="text-[9px] italic text-muted-foreground">Rates are fixed by system administration.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Purpose of Loan</Label>
                <Textarea id="description" name="description" required className="rounded-xl" placeholder="E.g. Business expansion..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl h-11">Submit Request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve Loan Dialog */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form onSubmit={handleApproveLoan}>
            <DialogHeader>
              <DialogTitle>Approve & Disburse</DialogTitle>
              <DialogDescription>Reviewing request for {selectedLoan ? (members.find(m => m.id === selectedLoan.memberId)?.name) : 'Member'}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-200">
                <p className="text-[10px] uppercase font-bold text-blue-600 mb-1">Requested Capital</p>
                <p className="text-xl font-bold">{formatCurrency(selectedLoan?.amount || 0, currency)}</p>
              </div>

              {/* Locked Policy Section */}
              <div className="bg-muted/50 p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <Lock className="h-3 w-3" /> System Fixed Policy
                </div>
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium">Interest Model</span>
                    <Badge variant="outline" className="w-full justify-center capitalize py-1.5">{globalInterestModel}</Badge>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium">Deduction Type</span>
                    <Badge variant="outline" className="w-full justify-center capitalize py-1.5">{globalInterestType}</Badge>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium">Interest Rate</span>
                    <div className="h-8 flex items-center px-3 bg-background border rounded-lg font-bold">{globalInterestRate}%</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium">Calculated Interest</span>
                    <div className="h-8 flex items-center px-3 bg-background border rounded-lg font-bold text-primary">{formatCurrency(interestAmount, currency)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-green-500/5 p-3 rounded-xl border border-green-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-bold text-green-700">Net Disbursement</span>
                </div>
                <span className="text-lg font-bold text-green-700">{formatCurrency(netDisbursedDisplay, currency)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Duration (Months)</Label>
                  <Input name="duration" type="number" defaultValue="3" required className="rounded-xl h-11" />
                </div>
                <div className="grid gap-2">
                  <Label>Penalty (% Day)</Label>
                  <Input name="penaltyRate" type="number" step="0.01" defaultValue="0.15" required className="rounded-xl h-11" />
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label>Audit Justification</Label>
                <Textarea name="justification" placeholder="E.g. Approved by board..." required className="rounded-xl min-h-[60px]" />
              </div>

              <div className="grid gap-2">
                <Label>Check/Payment Proof</Label>
                <Input name="checkFile" type="file" className="rounded-xl h-11 py-2.5" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl h-11 font-bold">Confirm Disbursement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
