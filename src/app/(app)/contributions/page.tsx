'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, AlertCircle, Loader2, ShieldCheck, Upload, FileText, Info, Eye, Clock, Ban, CheckCircle2, RotateCcw } from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, where, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { verifyContributionAction, rejectContributionAction } from '@/lib/finance-client';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ContributionsPage() {
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
  const defaultAmount = settingsData?.contributionInterestRate || 50000;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'MMMM yyyy'));
  const [selectedContribution, setSelectedContribution] = useState<any>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('history');

  const role = userData?.role || 'member';
  const isManagement = role === 'management' || role === 'admin';
  const isLoading = userDataLoading;

  // Firestore Subscriptions
  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), []);
  
  const contributionsQuery = useMemoFirebase(() => {
    if (!user || isLoading) return null;
    // Admins see everything ordered by date
    if (isManagement) return query(collection(firestore, 'contributions'), orderBy('date', 'desc'));
    // Members see their own ordered by date. This will trigger a missing index error with a link.
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid), orderBy('date', 'desc'));
  }, [user, isManagement, isLoading]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  
  const contributions = useMemo(() => {
    return contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [contributionsSnap]);

  const totalVerifiedBalance = useMemo(() => {
    return contributions
      .filter((c: any) => c.status === 'verified')
      .reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0);
  }, [contributions]);
  
  const pendingContributions = useMemo(() => contributions.filter((c: any) => c.status === 'pending'), [contributions]);
  const verifiedContributions = useMemo(() => contributions.filter((c: any) => c.status === 'verified'), [contributions]);
  const rejectedContributions = useMemo(() => contributions.filter((c: any) => c.status === 'rejected'), [contributions]);

  const handleSubmitContribution = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
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

      await addDoc(collection(firestore, 'contributions'), {
        memberId: user.uid,
        amount,
        period,
        date: serverTimestamp(),
        proofUrl,
        status: 'pending',
        justification: `Self-submitted for ${period}`
      });

      toast({ title: "Submitted", description: "Your contribution has been submitted for verification." });
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionContribution = async (type: 'verify' | 'reject', e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedContribution) return;
    
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
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Unknown Member';

  const periods = [
    format(new Date(), 'MMMM yyyy'),
    format(subMonths(new Date(), 1), 'MMMM yyyy'),
    format(subMonths(new Date(), 2), 'MMMM yyyy')
  ];

  const renderTable = (data: any[]) => (
    <Table>
      <TableHeader className="bg-muted/10">
        <TableRow>
          {isManagement && <TableHead className="px-6">Member</TableHead>}
          <TableHead className={cn(!isManagement && "px-6")}>Period</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right px-6">Amount</TableHead>
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
              {isManagement && <TableCell className="font-bold px-6">{getMemberName(h.memberId)}</TableCell>}
              <TableCell className={cn("font-medium", !isManagement && "px-6")}>{h.period}</TableCell>
              <TableCell className="text-[10px] text-muted-foreground">
                {h.date?.seconds ? format(new Date(h.date.seconds * 1000), 'MMM d, yyyy') : 'Processing...'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={h.status === 'pending' ? 'secondary' : h.status === 'rejected' ? 'destructive' : 'default'} 
                    className={cn(
                      "text-[9px] uppercase font-bold border-none",
                      h.status === 'pending' && "bg-orange-500/10 text-orange-600",
                      h.status === 'verified' && "bg-green-500/10 text-green-600",
                      h.status === 'rejected' && "bg-destructive/10 text-destructive"
                    )}
                  >
                    {h.status}
                  </Badge>
                  {h.status === 'rejected' && !isManagement && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedContribution(h); setIsVerifyOpen(true); }}>
                       <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                  {h.proofUrl && (
                    <a href={h.proofUrl} target="_blank" rel="noopener noreferrer" title="View Proof">
                      <FileText className="h-4 w-4 text-primary hover:scale-110 transition-transform cursor-pointer" />
                    </a>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right px-6 font-bold">{formatCurrency(h.amount, currency)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Savings & Contributions</h1>
          <p className="text-muted-foreground font-medium">
            {isManagement ? "Audit and verify member savings" : "Track your verified wealth and pending submissions"}
          </p>
        </div>
        <div className="bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20">
          <p className="text-xs text-primary font-bold uppercase tracking-wider">
            {isManagement ? "Total Verified Fund Value" : "My Verified Balance"}
          </p>
          <p className="text-2xl font-bold">{formatCurrency(totalVerifiedBalance, currency)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
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
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select Month" /></SelectTrigger>
                      <SelectContent>
                        {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Contribution Amount</Label>
                    <div className="relative">
                      <Input name="amount" type="number" defaultValue={defaultAmount} required className="h-11 rounded-xl pr-14" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground uppercase">
                        {currency}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proofFile">Proof of Payment</Label>
                    <div className="flex flex-col gap-2">
                      <Input name="proofFile" type="file" required className="rounded-xl h-11 py-2" />
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> Upload screenshot or bank receipt
                      </p>
                    </div>
                  </div>
                  <Button className="w-full h-11 rounded-xl font-bold" type="submit" disabled={isSubmitting}>
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

        <div className="space-y-6 lg:col-span-2">
          <Tabs defaultValue="history" onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-12 rounded-xl bg-muted/50 p-1 mb-6">
              <TabsTrigger value="history" className="rounded-lg font-bold text-[11px] uppercase tracking-wider">History</TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg font-bold text-[11px] uppercase tracking-wider">Pending</TabsTrigger>
              <TabsTrigger value="verified" className="rounded-lg font-bold text-[11px] uppercase tracking-wider">Verified</TabsTrigger>
              <TabsTrigger value="rejected" className="rounded-lg font-bold text-[11px] uppercase tracking-wider">Rejected</TabsTrigger>
            </TabsList>

            <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/5">
                <CardTitle className="flex items-center gap-2 text-lg">
                   <History className="h-5 w-5" /> {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Record
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TabsContent value="history" className="m-0">{renderTable(contributions)}</TabsContent>
                <TabsContent value="pending" className="m-0">{renderTable(pendingContributions)}</TabsContent>
                <TabsContent value="verified" className="m-0">{renderTable(verifiedContributions)}</TabsContent>
                <TabsContent value="rejected" className="m-0">{renderTable(rejectedContributions)}</TabsContent>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </div>

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
                      <Button variant="outline" size="sm" className="w-full text-[11px] h-9 rounded-lg font-bold" asChild>
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
                    className="rounded-xl min-h-[90px]" 
                  />
                </div>
              </div>
              <DialogFooter className="flex gap-2">
                <Button 
                  className="flex-1 h-11 rounded-xl font-bold bg-destructive hover:bg-destructive/90 text-white" 
                  type="submit" 
                  name="action" 
                  value="reject" 
                  disabled={isSubmitting}
                >
                  <Ban className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button 
                  className="flex-1 h-11 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white" 
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
                <Button className="w-full h-11 rounded-xl font-bold" onClick={() => {
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
    </div>
  );
}
