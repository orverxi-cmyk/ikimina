'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, History, AlertCircle, Loader2, ShieldCheck, Upload, CheckCircle2, FileText, Info } from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, where, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { recordContributionAction } from '@/lib/finance-client';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function ContributionsPage() {
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
  const defaultAmount = settingsData?.contributionInterestRate || 50000;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'MMMM yyyy'));

  const role = userData?.role || 'member';
  const isManagement = role === 'management' || role === 'admin';

  // Firestore Subscriptions
  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), []);
  
  const contributionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    if (isManagement) return query(collection(firestore, 'contributions'), orderBy('date', 'desc'));
    return query(collection(firestore, 'contributions'), where('memberId', '==', user.uid), orderBy('date', 'desc'));
  }, [user, isManagement]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);

  const totalBalance = useMemo(() => contributions.filter((c: any) => c.status !== 'pending').reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0), [contributions]);
  
  const unpaidMembers = useMemo(() => {
    if (!isManagement) return [];
    const paidMemberIds = new Set(contributions.filter((c: any) => c.period === selectedPeriod).map((c: any) => c.memberId));
    return members.filter((m: any) => m.role === 'member' && !paidMemberIds.has(m.id));
  }, [members, contributions, selectedPeriod, isManagement]);

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isManagement || !user) return;
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const memberId = formData.get('memberId') as string;
    const amount = Number(formData.get('amount'));
    const period = formData.get('period') as string;
    const justification = formData.get('justification') as string;

    try {
      await recordContributionAction(user.uid, {
        memberId,
        amount,
        period,
        justification
      });
      
      toast({ title: "Success", description: "Contribution recorded via secure backend." });
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

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
      // 1. Upload Proof
      const fileRef = ref(storage, `contribution_proofs/${user.uid}/${Date.now()}_${proofFile.name}`);
      const uploadResult = await uploadBytes(fileRef, proofFile);
      const proofUrl = await getDownloadURL(uploadResult.ref);

      // 2. Save Contribution as Pending
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

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Unknown Member';

  const periods = [
    format(new Date(), 'MMMM yyyy'),
    format(subMonths(new Date(), 1), 'MMMM yyyy'),
    format(subMonths(new Date(), 2), 'MMMM yyyy')
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Contribution Tracking</h1>
          <p className="text-muted-foreground">
            {isManagement ? "Overview of member payments" : "My contribution history"}
          </p>
        </div>
        <div className="bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20">
          <p className="text-xs text-primary font-bold uppercase tracking-wider">
            {isManagement ? "Total Tontine Funds" : "My Total Contributions"}
          </p>
          <p className="text-2xl font-bold">{formatCurrency(totalBalance, currency)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Form Column */}
        <div className="lg:col-span-1 space-y-6">
          {isManagement ? (
            <Card className="border-primary/20 bg-primary/5 h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Wallet className="h-5 w-5" /> Record Payment
                </CardTitle>
                <CardDescription>Enter details of a manual payment received</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecordPayment} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="memberId">Select Member</Label>
                    <Select name="memberId" required>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue placeholder={loadingMembers ? "Loading members..." : "Choose a member"} />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="period">Period</Label>
                      <Select name="period" defaultValue={selectedPeriod}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Period" /></SelectTrigger>
                        <SelectContent>
                          {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount ({currency})</Label>
                      <Input name="amount" type="number" defaultValue={defaultAmount} required className="h-11 rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="justification" className="flex items-center gap-1">
                      Audit Justification <ShieldCheck className="h-3 w-3 text-primary" />
                    </Label>
                    <Textarea name="justification" placeholder="E.g., Cash received at meeting..." required className="rounded-xl min-h-[80px]" />
                  </div>
                  <Button className="w-full h-11 rounded-xl font-bold" type="submit" disabled={isSubmitting || loadingMembers}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Record
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/20 bg-primary/5 h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Upload className="h-5 w-5" /> Submit Savings
                </CardTitle>
                <CardDescription>Upload proof of your monthly contribution</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitContribution} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="period">Month</Label>
                    <Select name="period" defaultValue={selectedPeriod}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select Month" /></SelectTrigger>
                      <SelectContent>
                        {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount ({currency})</Label>
                    <Input name="amount" type="number" defaultValue={defaultAmount} required className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proofFile">Proof of Payment</Label>
                    <div className="flex flex-col gap-2">
                      <Input name="proofFile" type="file" required className="rounded-xl h-11 py-2" />
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> Screenshots or bank slips only
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
          )}
        </div>

        {/* List Column */}
        <div className={cn("space-y-6 lg:col-span-2")}>
          {isManagement && (
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertCircle className="h-5 w-5 text-orange-500" /> Pending for {selectedPeriod}
                </CardTitle>
                <CardDescription>Members with no verified payments this month</CardDescription>
              </CardHeader>
              <CardContent>
                {unpaidMembers.length === 0 ? (
                  <div className="flex items-center gap-2 text-green-600 bg-green-500/10 p-4 rounded-xl font-bold">
                    <ShieldCheck className="h-5 w-5" /> All members have paid for this period!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {unpaidMembers.map((m: any) => (
                      <div key={m.id} className="p-3 border rounded-xl bg-muted/30 flex justify-between items-center">
                        <span className="font-bold text-sm">{m.name}</span>
                        <Badge variant="secondary" className="text-[9px] uppercase">Unpaid</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-xl bg-card rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> {role === 'member' ? "My Payments" : "Recent Payments"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {isManagement && <TableHead>Member</TableHead>}
                    <TableHead>Period</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingContributions ? (
                    <TableRow>
                      <TableCell colSpan={isManagement ? 5 : 4} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : contributions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isManagement ? 5 : 4} className="h-24 text-center text-muted-foreground italic">
                        No payments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contributions.map((h: any) => (
                      <TableRow key={h.id}>
                        {isManagement && <TableCell className="font-bold">{getMemberName(h.memberId)}</TableCell>}
                        <TableCell className="font-medium">{h.period}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {h.date?.seconds ? format(new Date(h.date.seconds * 1000), 'MMM d, yyyy') : 'Processing...'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={h.status === 'pending' ? 'secondary' : 'default'} 
                              className={cn(
                                "text-[9px] uppercase font-bold",
                                h.status === 'pending' ? "bg-orange-500/10 text-orange-600" : "bg-green-500/10 text-green-600"
                              )}
                            >
                              {h.status || 'verified'}
                            </Badge>
                            {h.proofUrl && (
                              <a href={h.proofUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-3 w-3 text-primary hover:scale-110 transition-transform" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(h.amount, currency)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
