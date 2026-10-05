'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Wallet, 
  HandCoins, 
  History, 
  FileText, 
  User as UserIcon, 
  Loader2, 
  Landmark,
  ShieldAlert,
  UserX,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';
import { 
  requestAccountDeletionAction, 
  cancelAccountDeletionRequestAction 
} from '@/lib/finance-client';
import { safeFormatDate } from '@/lib/loan-utils';

import { useSettings } from '@/context/settings-context';

export default function ProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabParam === 'account' ? 'account' : 'overview');

  // Deletion Request States
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);

  const { user, loading: authLoading } = useUser();
  const firestore = useFirestore();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';
  const { toast } = useToast();

  useEffect(() => {
    if (tabParam === 'account') {
      setActiveTab('account');
      if (searchParams.get('openDialog') === 'true') {
        setIsRequestDialogOpen(true);
      }
    } else if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam, searchParams]);

  // Resolve target user (self or others for management)
  const targetId = params.username === 'me' ? user?.uid : params.username as string;

  const userRef = useMemoFirebase(() => targetId ? doc(firestore, 'users', targetId) : null, [targetId]);
  const { data: userData, loading: userDocLoading } = useDoc(userRef);

  // Current user's own data for permission check
  const currentUserRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: currentUserData, loading: currentUserLoading } = useDoc(currentUserRef);

  const userLoading = authLoading || userDocLoading || currentUserLoading;
  const isManagement = currentUserData?.role === 'admin' || currentUserData?.role === 'management';
  const isOwnProfile = Boolean(user && (targetId === user.uid || params.username === 'me'));

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

  // Query latest account deletion request for this profile
  const deletionRequestsQuery = useMemoFirebase(() => {
    if (!targetId || userLoading || !user) return null;
    if (targetId !== user.uid && !isManagement) return null;
    return query(
      collection(firestore, 'account_deletion_requests'),
      where('userId', '==', targetId),
      orderBy('requestedAt', 'desc'),
      limit(1)
    );
  }, [targetId, userLoading, user, isManagement]);

  const { data: contributionsSnap, loading: loadingConts } = useCollection(contributionsQuery);
  const { data: loansSnap, loading: loadingLoans } = useCollection(loansQuery);
  const { data: deletionRequestsSnap, loading: loadingDeletions } = useCollection(deletionRequestsQuery);

  const latestDeletionRequest: any = useMemo(() => {
    if (!deletionRequestsSnap || deletionRequestsSnap.empty) return null;
    const d = deletionRequestsSnap.docs[0];
    return { id: d.id, ...(d.data() as any) };
  }, [deletionRequestsSnap]);

  const contributions = useMemo(() => {
    return contributionsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [contributionsSnap]);

  const loans = useMemo(() => {
    return loansSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
  }, [loansSnap]);

  const totalContributions = useMemo(() => contributions.reduce((acc, c: any) => acc + (c.amount || 0), 0), [contributions]);
  const activeDebt = useMemo(() => loans.reduce((acc, l: any) => acc + (l.status === 'approved' ? (l.balance || 0) : 0), 0), [loans]);

  const handleRequestDeletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are offline. Please connect to the internet and try again."
      });
    }

    if (!deletionReason.trim()) {
      return toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please state your reason for requesting account deletion."
      });
    }

    if (activeDebt > 0) {
      return toast({
        variant: "destructive",
        title: "Active Loan Balance",
        description: `Cannot request account deletion with an active loan debt of ${formatCurrency(activeDebt, currency)}. Please clear your loan first.`
      });
    }

    setIsSubmittingDeletion(true);
    try {
      await requestAccountDeletionAction({
        reason: deletionReason.trim(),
        savingsBalance: totalContributions,
        accruedInterest: userData?.accruedInterest || 0,
        activeLoanBalance: activeDebt
      });
      toast({
        title: "Account Deletion Requested",
        description: "Your request has been submitted and added to the Super Admin request table for official review."
      });
      setIsRequestDialogOpen(false);
      setDeletionReason('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Request Failed",
        description: parsed.message
      });
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

  const handleCancelDeletionSubmit = async (requestId: string) => {
    if (!user) return;
    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are offline. Please reconnect and try again."
      });
    }

    if (!confirm("Are you sure you want to withdraw your account deletion request?")) return;

    setIsSubmittingDeletion(true);
    try {
      await cancelAccountDeletionRequestAction(requestId);
      toast({
        title: "Request Withdrawn",
        description: "Your account deletion request has been cancelled."
      });
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Failed to Cancel",
        description: parsed.message
      });
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

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

      {/* Pending Account Deletion Request Banner */}
      {latestDeletionRequest?.status === 'pending' && (
        <Card className="border-amber-500/30 bg-amber-500/10 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
                <Clock className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Account Deletion Request Pending Review</h3>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase bg-amber-500/20 text-amber-800 border-amber-400">
                    Awaiting Super Admin
                  </Badge>
                </div>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                  Reason: &ldquo;{latestDeletionRequest.reason}&rdquo; &bull; Submitted on {safeFormatDate(latestDeletionRequest.requestedAt, 'PPP')}
                </p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                  Your request has been added to the Super Admin request table for official review.
                </p>
              </div>
            </div>
            {isOwnProfile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCancelDeletionSubmit(latestDeletionRequest.id)}
                disabled={isSubmittingDeletion}
                className="rounded-xl text-xs font-bold border-amber-600/40 text-amber-800 hover:bg-amber-500/20 shrink-0"
              >
                {isSubmittingDeletion ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                Withdraw Request
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Previously Rejected Deletion Notice */}
      {latestDeletionRequest?.status === 'rejected' && isOwnProfile && (
        <Card className="border-red-500/30 bg-red-500/10 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-destructive">Previous Deletion Request Turned Down</p>
              <p className="text-muted-foreground">
                Your previous request was rejected by administration. Reason: &ldquo;{latestDeletionRequest.rejectionReason || 'Contact administration for details'}&rdquo;
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className={cn(
            "inline-flex w-full min-w-max sm:min-w-0 sm:w-fit h-12 p-1 bg-muted rounded-xl border border-border/60 gap-1",
            isOwnProfile ? "grid grid-cols-4" : "grid grid-cols-3"
          )}>
            <TabsTrigger value="overview" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><Landmark className="mr-1.5 sm:mr-2 h-4 w-4" /> Summary</TabsTrigger>
            <TabsTrigger value="contributions" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><Wallet className="mr-1.5 sm:mr-2 h-4 w-4" /> Contributions</TabsTrigger>
            <TabsTrigger value="loans" className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold"><HandCoins className="mr-1.5 sm:mr-2 h-4 w-4" /> Loans</TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger 
                value="account" 
                className="whitespace-nowrap shrink-0 px-3 sm:px-4 text-xs font-semibold text-destructive hover:text-destructive data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
              >
                <UserX className="mr-1.5 sm:mr-2 h-4 w-4" /> Delete Account
              </TabsTrigger>
            )}
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

        {/* Account Tab (Danger Zone & Deletion Request) */}
        {isOwnProfile && (
          <TabsContent value="account" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-none shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Membership &amp; Access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-xl space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Registered Name</p>
                    <p className="text-sm font-semibold text-foreground">{userData.name}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-xl space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Email Address</p>
                    <p className="text-sm font-semibold text-foreground">{userData.email}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-xl space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-bold">System Role</p>
                    <p className="text-sm font-semibold text-foreground capitalize">{userData.role || 'member'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Danger Zone: Account Deletion */}
              <Card className="border border-destructive/20 shadow-md bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-widest text-destructive flex items-center gap-2">
                    <UserX className="h-4 w-4" /> Danger Zone
                  </CardTitle>
                  <CardDescription>
                    Request permanent account deletion and scheme withdrawal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Once requested, your account deletion is submitted to the Super Admin request table for dual-control approval. Before an account can be approved for deletion, all active loan debt must be cleared.
                  </p>

                  {activeDebt > 0 && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        You have an active loan balance of <strong>{formatCurrency(activeDebt, currency)}</strong>. You must settle all active facilities before requesting deletion.
                      </span>
                    </div>
                  )}

                  {latestDeletionRequest?.status === 'pending' ? (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                        <Clock className="h-4 w-4 text-amber-600" />
                        Deletion Request Awaiting Review
                      </div>
                      <p className="text-xs text-amber-900/90 dark:text-amber-200/90 italic">
                        &ldquo;{latestDeletionRequest.reason}&rdquo;
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelDeletionSubmit(latestDeletionRequest.id)}
                        disabled={isSubmittingDeletion}
                        className="w-full rounded-xl text-xs font-bold border-amber-600/40 text-amber-800 hover:bg-amber-500/20"
                      >
                        {isSubmittingDeletion ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                        Withdraw Deletion Request
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setIsRequestDialogOpen(true)}
                      disabled={activeDebt > 0 || isSubmittingDeletion}
                      className="w-full rounded-xl text-xs font-bold gap-2 shadow-md"
                    >
                      <UserX className="h-4 w-4" /> Request Account Deletion
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Member Account Deletion Request Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-0 overflow-hidden">
          <form onSubmit={handleRequestDeletionSubmit}>
            <DialogHeader className="p-5 bg-destructive text-destructive-foreground">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-white">
                <UserX className="h-5 w-5" /> Request Account Deletion
              </DialogTitle>
              <DialogDescription className="text-red-100 text-xs mt-1">
                Your request will be submitted to the Super Admin request table for official review and approval.
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4">
              {/* Financial Position Snapshot */}
              <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2 text-xs">
                <span className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Your Financial Standing:</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Total Verified Savings:</span>
                  <span className="font-bold text-foreground">{formatCurrency(totalContributions, currency)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Accrued Interest:</span>
                  <span className="font-bold text-emerald-600">+{formatCurrency(userData?.accruedInterest || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Outstanding Loans:</span>
                  <span className="font-bold text-emerald-600">0 {currency} (Cleared)</span>
                </div>
              </div>

              {/* Warning */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Upon approval by the Super Admin, your login credentials will be revoked and your member record deleted. Any savings settlement will be processed per scheme bylaws.
                </p>
              </div>

              {/* Reason input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Reason for Account Deletion <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={deletionReason}
                  onChange={e => setDeletionReason(e.target.value)}
                  placeholder="Please state why you wish to delete your account (e.g. Relocating, personal finance reorganization, etc.)..."
                  required
                  rows={3}
                  className="text-xs rounded-xl bg-muted border-none resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-muted/20 border-t flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRequestDialogOpen(false)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingDeletion || !deletionReason.trim()} variant="destructive" className="rounded-xl text-xs font-bold gap-1.5 shadow-md">
                {isSubmittingDeletion ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserX className="h-4 w-4 mr-1" />}
                Submit Request to Super Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
