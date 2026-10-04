'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Badge } from '@/components/ui/badge';
import { Wallet, HandCoins, History, FileText, User as UserIcon, Loader2, Landmark } from 'lucide-react';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { useSettings } from '@/context/settings-context';

export default function ProfilePage() {
  const params = useParams();
  const { user, loading: authLoading } = useUser();
  const firestore = useFirestore();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  // Resolve target user (self or others for management)
  const targetId = params.username === 'me' ? user?.uid : params.username as string;

  const userRef = useMemoFirebase(() => targetId ? doc(firestore, 'users', targetId) : null, [targetId]);
  const { data: userData, loading: userDocLoading } = useDoc(userRef);

  // Current user's own data for permission check
  const currentUserRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: currentUserData, loading: currentUserLoading } = useDoc(currentUserRef);

  const userLoading = authLoading || userDocLoading || currentUserLoading;
  const isManagement = currentUserData?.role === 'admin' || currentUserData?.role === 'management';

  // Fetch target user's financial records with server-side ordering to utilize indexes
  const contributionsQuery = useMemoFirebase(() => {
    if (!targetId || userLoading || !user) return null;
    
    // SECURITY GUARD: Only allow listing if viewing self or if user is management
    if (targetId !== user.uid && !isManagement) return null;

    return query(collection(firestore, 'contributions'), where('memberId', '==', targetId), orderBy('date', 'desc'));
  }, [targetId, userLoading, user, isManagement]);

  const loansQuery = useMemoFirebase(() => {
    if (!targetId || userLoading || !user) return null;
    
    // SECURITY GUARD: Only allow listing if viewing self or if user is management
    if (targetId !== user.uid && !isManagement) return null;

    return query(collection(firestore, 'loans'), where('memberId', '==', targetId), orderBy('requestDate', 'desc'));
  }, [targetId, userLoading, user, isManagement]);

  const { data: contributionsSnap, loading: loadingConts } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);

  const contributions = useMemo(() => {
    return contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [contributionsSnap]);

  const loans = useMemo(() => {
    return loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [loansSnap]);

  const totalContributions = useMemo(() => contributions.reduce((acc, c: any) => acc + (c.amount || 0), 0), [contributions]);
  const activeDebt = useMemo(() => loans.reduce((acc, l: any) => acc + (l.status === 'approved' ? (l.balance || 0) : 0), 0), [loans]);

  if (userLoading || loadingConts || loadingLoans) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Member profile not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 pb-24">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row gap-4 sm:gap-6 items-center md:items-start bg-card p-4 sm:p-6 rounded-2xl border border-primary/5 shadow-sm">
        {user && (targetId === user.uid || params.username === 'me') ? (
          <AvatarUpload
            uid={user.uid}
            currentPhotoURL={userData.photoURL ?? user.photoURL}
            displayName={userData.name ?? user.displayName}
            size={96}
          />
        ) : (
          <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-background shadow-xl">
            <AvatarImage src={userData.photoURL || `https://picsum.photos/seed/${targetId}/200/200`} />
            <AvatarFallback><UserIcon className="h-10 w-10" /></AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 text-center md:text-left space-y-1">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <h1 className="text-[13px] font-bold font-headline text-foreground">{userData.name}</h1>
            <Badge variant="outline" className="w-fit mx-auto md:mx-0 font-bold uppercase tracking-wider text-[9px] border-primary/20 text-primary">
              {userData.role}
            </Badge>
          </div>
          <p className="text-muted-foreground text-[12px] font-bold">{userData.email}</p>
          <p className="text-[12px] font-normal text-muted-foreground/80">
            Joined {userData.joinedAt ? format(userData.joinedAt.toDate(), 'MMMM yyyy') : 'Recently'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-primary/10 px-4 py-2 rounded-xl text-center">
            <p className="text-[10px] font-bold text-primary uppercase">Status</p>
            <p className="text-sm font-bold capitalize">{userData.status || 'Active'}</p>
          </div>
          <div className="bg-green-600/10 px-4 py-2 rounded-xl text-center">
            <p className="text-[10px] font-bold text-green-600 uppercase">Interest</p>
            <p className="text-sm font-bold text-green-600">+{formatCurrency(userData.accruedInterest || 0, currency)}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:w-fit grid grid-cols-3 h-12 p-1 bg-muted rounded-xl border border-border/60 gap-1">
            <TabsTrigger value="overview" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><Landmark className="mr-1.5 sm:mr-2 h-4 w-4" /> Summary</TabsTrigger>
            <TabsTrigger value="contributions" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><Wallet className="mr-1.5 sm:mr-2 h-4 w-4" /> Contributions</TabsTrigger>
            <TabsTrigger value="loans" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><HandCoins className="mr-1.5 sm:mr-2 h-4 w-4" /> Loans</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Capital Standing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted rounded-xl border border-primary/5">
                  <span className="text-sm text-muted-foreground font-medium">Total Contributions</span>
                  <span className="font-bold">{formatCurrency(totalContributions, currency)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted rounded-xl border border-green-500/5">
                  <span className="text-sm text-muted-foreground font-medium">Accumulated Interest</span>
                  <span className="font-bold text-green-600">+{formatCurrency(userData.accruedInterest || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <span className="text-sm text-primary font-bold">Total Assets</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(totalContributions + (userData.accruedInterest || 0), currency)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Liability Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted rounded-xl border border-border">
                  <span className="text-sm text-muted-foreground font-medium">Active Loan Balance</span>
                  <span className="font-bold text-foreground">{formatCurrency(activeDebt, currency)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted rounded-xl">
                  <span className="text-sm text-muted-foreground font-medium">Total Repayments Made</span>
                  <span className="font-bold">0 {currency}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted rounded-xl">
                  <span className="text-sm text-muted-foreground font-bold">Net Position</span>
                  <span className={cn(
                    "font-bold text-lg",
                    (totalContributions - activeDebt) >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    {formatCurrency(totalContributions - activeDebt, currency)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contributions">
          <Card className="border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Recorded</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributions.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center h-24 text-muted-foreground">No payments found.</TableCell></TableRow>
                  ) : (
                    contributions.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold text-sm">
                          {c.date ? (c.date.toDate ? format(c.date.toDate(), 'MMM d, yyyy') : format(new Date(c.date), 'MMM d, yyyy')) : c.period || '...'}
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(c.amount, currency)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <Card className="border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Loan Directory</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Interest Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No loan requests found.</TableCell></TableRow>
                  ) : (
                    loans.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-[10px]">
                          {l.requestDate ? format(l.requestDate.toDate(), 'MMM d, yyyy') : '...'}
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(l.amount, currency)}</TableCell>
                        <TableCell className="text-[10px] uppercase font-bold text-muted-foreground">{l.interestType || 'n/a'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn(
                            "text-[9px] uppercase font-bold border-none",
                            l.status === 'approved' && "bg-green-500/10 text-green-600",
                            l.status === 'rejected' && "bg-destructive/10 text-destructive",
                            l.status === 'requested' && "bg-blue-500/10 text-blue-600"
                          )}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">{formatCurrency(l.balance || 0, currency)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
