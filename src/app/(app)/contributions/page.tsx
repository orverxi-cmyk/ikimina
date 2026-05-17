'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, History, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCollection } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, addDoc, serverTimestamp, deleteDoc, doc, writeBatch, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function ContributionsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'MMMM yyyy'));

  // Firestore Subscriptions
  const membersQuery = useMemo(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), [firestore]);
  const contributionsQuery = useMemo(() => query(collection(firestore, 'contributions'), orderBy('date', 'desc')), [firestore]);

  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);
  const { data: contributionsSnap, loading: loadingContributions } = useCollection(contributionsQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);
  const contributions = useMemo(() => contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [contributionsSnap]);

  // Calculations
  const totalBalance = useMemo(() => contributions.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0), [contributions]);
  
  const unpaidMembers = useMemo(() => {
    const paidMemberIds = new Set(contributions.filter((c: any) => c.period === selectedPeriod).map((c: any) => c.memberId));
    return members.filter((m: any) => !paidMemberIds.has(m.id));
  }, [members, contributions, selectedPeriod]);

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const memberId = formData.get('memberId') as string;
    const amount = Number(formData.get('amount'));
    const period = formData.get('period') as string;

    try {
      await addDoc(collection(firestore, 'contributions'), {
        memberId,
        amount,
        period,
        date: serverTimestamp(),
        recordedBy: user.uid,
      });
      
      toast({ title: "Success", description: "Contribution recorded successfully" });
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to record contribution" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear ALL contribution history? This action cannot be undone.")) return;
    
    setIsSubmitting(true);
    try {
      const batch = writeBatch(firestore);
      const snapshot = await getDocs(collection(firestore, 'contributions'));
      snapshot.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      toast({ title: "History Cleared", description: "All contribution records have been removed." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to clear history" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMemberName = (id: string) => members.find((m: any) => m.id === id)?.name || 'Unknown Member';

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Contribution Tracking</h1>
          <p className="text-muted-foreground">Manual recording of member payments</p>
        </div>
        <div className="bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20">
          <p className="text-xs text-primary font-bold uppercase tracking-wider">Total Tontine Funds</p>
          <p className="text-2xl font-bold">{totalBalance.toLocaleString()} RWF</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Record Payment Form */}
        <Card className="lg:col-span-1 border-primary/20 bg-primary/5">
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
                  <SelectTrigger>
                    <SelectValue placeholder={loadingMembers ? "Loading members..." : "Choose a member"} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Select name="period" defaultValue={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={format(new Date(), 'MMMM yyyy')}>{format(new Date(), 'MMMM yyyy')}</SelectItem>
                    <SelectItem value={format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'MMMM yyyy')}>
                      {format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'MMMM yyyy')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (RWF)</Label>
                <Input name="amount" type="number" defaultValue="50000" required />
              </div>
              <Button className="w-full" type="submit" disabled={isSubmitting || loadingMembers}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Record
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Unpaid Alerts & History */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" /> Pending for {selectedPeriod}
              </CardTitle>
              <CardDescription>Members who have not yet contributed for this period</CardDescription>
            </CardHeader>
            <CardContent>
              {unpaidMembers.length === 0 ? (
                <p className="text-sm text-green-600 font-medium">All members have paid for this period!</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {unpaidMembers.map((m: any) => (
                    <Alert key={m.id} variant="default" className="border-orange-500/20 bg-orange-500/5">
                      <AlertTitle className="text-orange-500 font-bold">{m.name}</AlertTitle>
                      <AlertDescription className="text-xs">No payment recorded for {selectedPeriod}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Payments
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearHistory}
                disabled={isSubmitting || contributions.length === 0}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Clear History
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingContributions ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : contributions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No payments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contributions.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{getMemberName(h.memberId)}</TableCell>
                        <TableCell>{h.period}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {h.date?.seconds ? format(new Date(h.date.seconds * 1000), 'MMM d, yyyy') : 'Pending...'}
                        </TableCell>
                        <TableCell className="text-right font-bold">{h.amount?.toLocaleString()} RWF</TableCell>
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
