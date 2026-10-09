'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Ban, CheckCircle2, Clock, ExternalLink, FileCheck, FileText, Loader2,
  Plus, ShieldCheck, UploadCloud, UserMinus, Wallet, X, XCircle, AlertTriangle, Search,
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, where, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from '@/firebase';
import {
  initiateFinalPayoutAction,
  approveFinalPayoutAction,
  rejectFinalPayoutAction,
} from '@/lib/finance-client';
import { canExportFinalPayouts, exportFinalPayoutsToExcel } from '@/lib/final-payouts-export';
import { ExportFinalPayoutsDialog } from '@/components/admin/export-final-payouts-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileSpreadsheet, Download } from 'lucide-react';

const PAYOUT_METHODS = ['Bank Transfer', 'Mobile Money', 'Cheque', 'Cash'];

const tsToMillis = (t: any) => (t?.toMillis ? t.toMillis() : t?.toDate ? t.toDate().getTime() : 0);
const fmtDate = (t: any, f = 'PPP') => (t?.toDate ? format(t.toDate(), f) : '—');

export default function FinalPayoutsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  // ---------- Role resolution ----------
  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const [cachedRole, setCachedRole] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user]);
  const { data: userData } = useDoc<any>(userRef);
  const role = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');
  const isSuperAdmin = role === 'admin';
  const canInitiate = ['accountant', 'senior_accountant', 'admin', 'management'].includes(role);
  const canReview = ['senior_accountant', 'reviewer', 'management'].includes(role);
  const canApprove = ['admin', 'management'].includes(role) || isPrimaryAdmin;
  const canView = canInitiate || canReview || canApprove || ['auditor'].includes(role);

  // ---------- Data ----------
  const payoutsQuery = useMemoFirebase(() => (canView ? collection(firestore, 'final_payouts') : null), [canView]);
  const { data: payoutsSnap, loading } = useCollection(payoutsQuery);
  const payouts = useMemo(
    () => (payoutsSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [])
      .sort((a: any, b: any) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt)),
    [payoutsSnap]
  );
  const pending = useMemo(() => payouts.filter((p: any) => p.status === 'pending' || p.status === 'processing'), [payouts]);
  const approved = useMemo(() => payouts.filter((p: any) => p.status === 'approved'), [payouts]);
  const rejected = useMemo(() => payouts.filter((p: any) => p.status === 'rejected'), [payouts]);
  const sum = (list: any[]) => list.reduce((s, p) => s + (Number(p.totalPayout) || 0), 0);

  const membersQuery = useMemoFirebase(() => (canInitiate ? collection(firestore, 'users') : null), [canInitiate]);
  const { data: membersSnap } = useCollection(membersQuery);
  const members = useMemo(
    () => (membersSnap?.docs.map(d => ({ id: d.id, ...(d.data() as any) })) || [])
      .filter((m: any) => m.id !== user?.uid)
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')),
    [membersSnap, user?.uid]
  );

  // ---------- Initiate form state ----------
  const [isInitiateOpen, setIsInitiateOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState(PAYOUT_METHODS[0]);
  const [payoutReference, setPayoutReference] = useState('');
  const [notes, setNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill from ?memberId= (linked from Members Directory)
  useEffect(() => {
    if (typeof window === 'undefined' || !canInitiate) return;
    const mid = new URLSearchParams(window.location.search).get('memberId');
    if (mid) {
      setSelectedMemberId(mid);
      setIsInitiateOpen(true);
    }
  }, [canInitiate]);

  const selectedMember = useMemo(() => members.find((m: any) => m.id === selectedMemberId), [members, selectedMemberId]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m: any) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q));
  }, [members, memberSearch]);

  // Live financial position of the selected member
  const contribsQuery = useMemoFirebase(
    () => (selectedMemberId ? query(collection(firestore, 'contributions'), where('memberId', '==', selectedMemberId)) : null),
    [selectedMemberId]
  );
  const { data: contribsSnap, loading: contribsLoading } = useCollection(contribsQuery);
  const loansQuery = useMemoFirebase(
    () => (selectedMemberId ? query(collection(firestore, 'loans'), where('memberId', '==', selectedMemberId)) : null),
    [selectedMemberId]
  );
  const { data: loansSnap, loading: loansLoading } = useCollection(loansQuery);

  const position = useMemo(() => {
    let contributionTotal = 0, verifiedCount = 0, outstandingLoans = 0;
    contribsSnap?.docs.forEach(d => {
      const c: any = d.data();
      if (c.status === 'verified') { contributionTotal += Number(c.amount) || 0; verifiedCount++; }
    });
    loansSnap?.docs.forEach(d => {
      const l: any = d.data();
      if (l.status === 'approved') outstandingLoans += Math.max(0, Number(l.balance) || 0);
    });
    const accruedInterest = Number(selectedMember?.accruedInterest) || 0;
    return { contributionTotal, verifiedCount, outstandingLoans, accruedInterest, total: contributionTotal + accruedInterest };
  }, [contribsSnap, loansSnap, selectedMember]);
  const positionLoading = !!selectedMemberId && (contribsLoading || loansLoading);
  const memberHasPending = !!selectedMember?.finalPayoutPending;

  const resetInitiate = () => {
    setSelectedMemberId(''); setMemberSearch(''); setPayoutMethod(PAYOUT_METHODS[0]);
    setPayoutReference(''); setNotes(''); setDocFile(null); setDocUrl('');
  };

  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'Maximum document size is 10MB.' });
      return;
    }
    setDocFile(file);
    setIsUploading(true);
    try {
      const storage = getStorage(initializeFirebase().app);
      const fileRef = ref(storage, `final_payout_documents/${user.uid}/${Date.now()}_${file.name}`);
      const res = await uploadBytes(fileRef, file);
      setDocUrl(await getDownloadURL(res.ref));
    } catch (err: any) {
      setDocFile(null);
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message || 'Could not upload document.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || !docUrl || !notes.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await initiateFinalPayoutAction({
        memberId: selectedMemberId,
        documentUrl: docUrl,
        documentFileName: docFile?.name,
        notes: notes.trim(),
        payoutMethod,
        payoutReference: payoutReference.trim(),
      });
      toast({
        title: 'Final Payout Submitted',
        description: `${formatCurrency(res.totalPayout, currency)} for ${selectedMember?.name || 'member'} is awaiting Administrator approval.`,
      });
      resetInitiate();
      setIsInitiateOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Submission Failed', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Review state ----------
  const [selected, setSelected] = useState<any>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmDeletion, setConfirmDeletion] = useState(false);

  const openReview = (p: any) => {
    setSelected(p); setAdminNotes(''); setConfirmDeletion(false); setIsReviewOpen(true);
  };
  const isOwnRequest = selected?.initiatedBy === user?.uid;

  const handleApprove = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      await approveFinalPayoutAction({ payoutId: selected.id, adminNotes: adminNotes.trim() || undefined });
      toast({
        title: 'Final Payout Approved',
        description: `${selected.memberName} has been paid out ${formatCurrency(selected.totalPayout, currency)} and their account permanently deleted.`,
      });
      setIsReviewOpen(false); setSelected(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !rejectionReason.trim()) return;
    setIsSubmitting(true);
    try {
      await rejectFinalPayoutAction({ payoutId: selected.id, rejectionReason: rejectionReason.trim() });
      toast({ title: 'Final Payout Rejected', description: 'The member account remains active.' });
      setIsRejectOpen(false); setIsReviewOpen(false); setSelected(null); setRejectionReason('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Rejection Failed', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export Permissions & Modal state
  const canExport = canExportFinalPayouts(role, user?.email);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const handleQuickExportFinalPayouts = () => {
    if (!canExport) return;
    try {
      const result = exportFinalPayoutsToExcel({
        payouts,
        currency,
        statusFilter: 'all',
        exportedByName: userData?.name || user?.displayName || user?.email || 'Authorized Officer',
        exportedByEmail: user?.email || '',
        exportedByRole: role,
        scopeLabel: 'Complete Final Payouts Register',
        includeMetadata: true,
      });

      toast({
        title: 'Final Payouts Exported',
        description: `Exported ${result.totalExported} payout records to ${result.fileName}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not export final payouts.',
      });
    }
  };

  if (!canView) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
        <ShieldCheck className="h-10 w-10 text-destructive" />
        <h1 className="text-lg font-bold">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">Only staff can access member final payouts.</p>
      </div>
    );
  }

  const DocLink = ({ p }: { p: any }) => p.documentUrl ? (
    <Button variant="ghost" size="sm" asChild className="h-8 text-xs font-bold gap-1 text-primary hover:text-primary hover:bg-primary/10">
      <a href={p.documentUrl} target="_blank" rel="noopener noreferrer">
        <FileText className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{p.documentFileName || 'Document'}</span>
        <ExternalLink className="h-3 w-3 opacity-60" />
      </a>
    </Button>
  ) : <span className="text-xs text-muted-foreground italic">None</span>;

  const MemberCell = ({ p }: { p: any }) => (
    <div>
      <p className="font-bold text-sm text-foreground">{p.memberName}</p>
      <p className="text-[11px] text-muted-foreground">{p.memberEmail}</p>
    </div>
  );

  const EmptyRow = ({ cols, text }: { cols: number; text: string }) => (
    <TableRow>
      <TableCell colSpan={cols} className="h-36 text-center text-muted-foreground italic">
        {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /> : text}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Button variant="ghost" size="icon" asChild className="h-7 w-7 rounded-full -ml-2 text-muted-foreground hover:text-foreground">
              <Link href="/admin"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">Member Exit</Badge>
          </div>
          <h1 className="text-[13px] font-bold font-headline tracking-tight text-foreground">Final Payouts &amp; Account Closure</h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5">
            Settle a member&apos;s full balance on exit. The Accountant initiates with a supporting document; Administrator approval pays out and permanently deletes the account.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-xl h-10 px-3.5 font-bold text-xs gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 shadow-2xs"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Export Excel</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl text-xs w-56 shadow-lg border-border">
                <DropdownMenuItem onClick={handleQuickExportFinalPayouts} className="gap-2 font-semibold cursor-pointer">
                  <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Quick Export ({payouts.length} records)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsExportDialogOpen(true)} className="gap-2 font-semibold cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span>Custom Export &amp; Filters...</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canInitiate && (
            <Button
              id="initiate-final-payout-btn"
              onClick={() => { resetInitiate(); setIsInitiateOpen(true); }}
              className="rounded-xl font-bold text-[12px] gap-2 shadow-sm h-10 px-4 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Initiate Final Payout
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">Awaiting Approval</CardTitle>
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Clock className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-primary">{formatCurrency(sum(pending), currency)}</div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">{pending.length} payout{pending.length === 1 ? '' : 's'} pending</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">Total Paid Out</CardTitle>
            <div className="p-2.5 bg-muted rounded-xl text-foreground"><Wallet className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-foreground">-{formatCurrency(sum(approved), currency)}</div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">Removed from group savings</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Members Exited</CardTitle>
            <div className="p-2.5 bg-muted rounded-xl text-muted-foreground"><UserMinus className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-lg font-bold font-headline text-foreground">{approved.length}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Accounts permanently closed</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dual-Control Protocol</CardTitle>
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><ShieldCheck className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-foreground">Accountant Initiates</div>
            <p className="text-[11px] text-muted-foreground mt-1">Admin Approves &amp; Deletes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-6">
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-3 h-11 p-1 bg-muted rounded-xl border border-border/60 gap-1">
            {[
              { v: 'pending', label: 'Pending Approval', icon: Clock, n: pending.length },
              { v: 'approved', label: 'Completed', icon: CheckCircle2, n: approved.length },
              { v: 'rejected', label: 'Rejected', icon: XCircle, n: rejected.length },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="gap-2 px-3 sm:px-4 whitespace-nowrap shrink-0 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                <Badge data-tab-count="true" className="tab-badge font-mono text-[10px] h-4 min-w-4 px-1.5 rounded-full border-none transition-colors">{t.n}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="pending">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-lg font-bold text-white">Final Payouts Awaiting Administrator Sign-Off</CardTitle>
              <CardDescription className="text-blue-100 text-xs">
                Approving a payout settles the member&apos;s ledger and permanently deletes their account.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Member</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Payout Amount</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Initiated By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Document</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.length === 0 ? <EmptyRow cols={5} text="No final payouts awaiting approval." /> : pending.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell><MemberCell p={p} /></TableCell>
                      <TableCell>
                        <p className="font-bold text-sm text-foreground">{formatCurrency(p.totalPayout, currency)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Savings {formatCurrency(p.contributionTotal, currency)}{p.accruedInterest > 0 ? ` + Interest ${formatCurrency(p.accruedInterest, currency)}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{p.initiatedByName}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(p.initiatedAt, 'MMM d, yyyy')}</p>
                      </TableCell>
                      <TableCell><DocLink p={p} /></TableCell>
                      <TableCell className="text-right">
                        {p.status === 'processing' ? (
                          <Badge className="bg-amber-500/10 text-amber-700 border-none text-[10px] font-bold uppercase gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Processing
                          </Badge>
                        ) : (canReview || canApprove) ? (
                          <Button size="sm" onClick={() => openReview(p)} className="rounded-xl font-bold text-xs h-8 px-3 shadow-sm">
                            {canApprove ? 'Review & Decide' : 'Review'}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-bold uppercase">Awaiting Review</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-lg font-bold text-white">Completed Exits</CardTitle>
              <CardDescription className="text-blue-100 text-xs">Members paid out and permanently removed from the group.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Former Member</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Amount Paid</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Method / Ref</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Approved By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase text-right">Document</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approved.length === 0 ? <EmptyRow cols={5} text="No completed final payouts yet." /> : approved.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell><MemberCell p={p} /></TableCell>
                      <TableCell className="font-bold text-sm text-foreground">-{formatCurrency(p.totalPayout, currency)}</TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{p.payoutMethod || '—'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{p.payoutReference || ''}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold text-foreground">{p.approvedByName}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(p.approvedAt, 'MMM d, yyyy')}</p>
                      </TableCell>
                      <TableCell className="text-right"><DocLink p={p} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white border-b border-blue-700/30 p-5">
              <CardTitle className="text-lg font-bold text-white">Rejected Final Payouts</CardTitle>
              <CardDescription className="text-blue-100 text-xs">Turned down by an Administrator. Member accounts were not affected.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-[12px] uppercase">Member</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Amount</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Initiated By</TableHead>
                    <TableHead className="font-bold text-[12px] uppercase">Rejection Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejected.length === 0 ? <EmptyRow cols={4} text="No rejected final payouts." /> : rejected.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell><MemberCell p={p} /></TableCell>
                      <TableCell className="font-bold text-sm text-muted-foreground line-through">{formatCurrency(p.totalPayout, currency)}</TableCell>
                      <TableCell className="text-xs">{p.initiatedByName}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="text-xs text-destructive font-medium italic">&ldquo;{p.rejectionReason}&rdquo;</p>
                        <p className="text-[10px] text-muted-foreground">by {p.rejectedByName}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== INITIATE DIALOG ===== */}
      <Dialog open={isInitiateOpen} onOpenChange={setIsInitiateOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl rounded-2xl bg-card border shadow-2xl p-0 overflow-hidden">
          <form onSubmit={handleInitiate} className="flex flex-col">
            <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 bg-muted/30 border-b">
              <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-widest w-fit mb-1">Accountant Desk</Badge>
              <DialogTitle className="text-lg sm:text-xl font-bold font-headline">Initiate Member Final Payout</DialogTitle>
              <DialogDescription className="text-xs">
                Pays the member their full savings and accrued interest. Once an Administrator approves, the account is permanently deleted.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Member picker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">Member *</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger id="final-payout-member" className="h-10 rounded-xl bg-muted/40 text-sm">
                    <SelectValue placeholder="Select the exiting member" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <div className="p-1.5 sticky top-0 bg-popover z-10">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          onKeyDown={e => e.stopPropagation()}
                          placeholder="Search name or email..."
                          className="h-8 pl-7 text-xs rounded-lg"
                        />
                      </div>
                    </div>
                    {filteredMembers.map((m: any) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name || m.email} <span className="text-muted-foreground">· {m.email}</span>
                        {m.finalPayoutPending ? ' (payout pending)' : ''}
                      </SelectItem>
                    ))}
                    {filteredMembers.length === 0 && <p className="text-xs text-muted-foreground p-3 text-center">No members found.</p>}
                  </SelectContent>
                </Select>
              </div>

              {/* Financial position */}
              {selectedMemberId && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  {positionLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Verified Savings</p>
                          <p className="font-bold text-foreground mt-0.5">{formatCurrency(position.contributionTotal, currency)}</p>
                          <p className="text-[10px] text-muted-foreground">{position.verifiedCount} contributions</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Accrued Interest</p>
                          <p className="font-bold text-foreground mt-0.5">{formatCurrency(position.accruedInterest, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Outstanding Loans</p>
                          <p className={`font-bold mt-0.5 ${position.outstandingLoans > 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {formatCurrency(position.outstandingLoans, currency)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Final Payout</span>
                        <span className="text-xl font-bold font-headline text-primary">{formatCurrency(position.total, currency)}</span>
                      </div>
                      {position.outstandingLoans > 0 && (
                        <p className="text-[11px] text-destructive font-medium flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> All loans must be fully repaid before a final payout can be initiated.
                        </p>
                      )}
                      {position.total <= 0 && position.outstandingLoans <= 0 && (
                        <p className="text-[11px] text-amber-700 font-medium flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> This member has no balance. Delete them directly from the Members Directory instead.
                        </p>
                      )}
                      {memberHasPending && (
                        <p className="text-[11px] text-amber-700 font-medium flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> A final payout for this member is already awaiting approval.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Payout Method</Label>
                  <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                    <SelectTrigger className="h-10 rounded-xl bg-muted/40 text-xs font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYOUT_METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Transaction Reference</Label>
                  <Input
                    value={payoutReference}
                    onChange={e => setPayoutReference(e.target.value)}
                    placeholder="e.g. bank ref / MoMo ID"
                    className="h-10 rounded-xl bg-muted/40 text-xs"
                  />
                </div>
              </div>

              {/* Document upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider">Supporting Document *</Label>
                  <Badge variant="outline" className="text-[9px] font-bold text-primary">Required</Badge>
                </div>
                {!docFile ? (
                  <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-muted/20 hover:bg-muted/40 transition-colors">
                    <input id="final-payout-doc-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleDocSelect} />
                    <label htmlFor="final-payout-doc-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                      <UploadCloud className="h-8 w-8 text-primary" />
                      <span className="text-xs font-bold text-foreground">Upload signed exit form, payment slip, or approval letter</span>
                      <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOCX (Max 10MB)</span>
                    </label>
                  </div>
                ) : (
                  <div className="p-3 bg-muted/50 rounded-xl border border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0"><FileCheck className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{docFile.name}</p>
                        <p className="text-[10px]">
                          {isUploading
                            ? <span className="text-primary font-bold inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</span>
                            : <span className="text-green-600 font-bold inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Attached</span>}
                        </p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setDocFile(null); setDocUrl(''); }} className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">Justification *</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for exit (resignation, relocation, retirement...) and any settlement details."
                  rows={3}
                  required
                  className="rounded-xl bg-muted/40 text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-4 sm:p-6 pt-3 bg-muted/30 border-t flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsInitiateOpen(false)} className="rounded-xl font-bold h-11 w-full sm:w-auto">Cancel</Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting || isUploading || !selectedMemberId || !docUrl || !notes.trim() ||
                  positionLoading || position.total <= 0 || position.outstandingLoans > 0 || memberHasPending
                }
                className="rounded-xl font-bold h-11 px-6 shadow-lg w-full sm:w-auto gap-2"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                Submit for Admin Approval
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== REVIEW DIALOG (Super Admin) ===== */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl rounded-2xl bg-card border shadow-2xl p-0 overflow-hidden">
          {selected && (
            <div className="flex flex-col">
              <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 bg-muted/30 border-b">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-widest">Executive Review</Badge>
                  <Badge variant="outline" className="text-[9px] font-mono">ID: {selected.id.slice(0, 8)}</Badge>
                </div>
                <DialogTitle className="text-lg sm:text-xl font-bold font-headline">
                  {canApprove ? 'Approve Final Payout' : 'Review Final Payout'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {canApprove ? 'Inspect the supporting document before approving.' : 'Review the payout details. Final approval requires an Administrator.'}
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="p-4 rounded-xl bg-muted border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Final Payout to {selected.memberName}</span>
                    <p className="text-2xl font-bold text-foreground font-headline mt-0.5">{formatCurrency(selected.totalPayout, currency)}</p>
                  </div>
                  <div className="text-[11px] text-muted-foreground sm:text-right">
                    <p>Savings: <span className="font-bold text-foreground">{formatCurrency(selected.contributionTotal, currency)}</span></p>
                    <p>Interest: <span className="font-bold text-foreground">{formatCurrency(selected.accruedInterest || 0, currency)}</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/30 p-3.5 rounded-xl border border-border">
                  <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Member Email</span><p className="font-mono text-[11px] mt-0.5 break-all">{selected.memberEmail || '—'}</p></div>
                  <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Initiated By</span><p className="font-semibold mt-0.5">{selected.initiatedByName} · {fmtDate(selected.initiatedAt, 'MMM d, yyyy')}</p></div>
                  <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Payout Method</span><p className="font-semibold mt-0.5">{selected.payoutMethod || '—'}</p></div>
                  <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Reference</span><p className="font-mono text-[11px] mt-0.5">{selected.payoutReference || '—'}</p></div>
                </div>

                {selected.notes && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Justification</Label>
                    <div className="p-3 bg-muted/40 rounded-xl text-xs italic border border-border/50 whitespace-pre-wrap break-words">&ldquo;{selected.notes}&rdquo;</div>
                  </div>
                )}

                <div className="p-3 bg-background rounded-xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-xs font-bold truncate">{selected.documentFileName}</span>
                  </div>
                  <Button asChild size="sm" className="h-8 rounded-lg font-bold text-xs gap-1.5 shrink-0">
                    <a href={selected.documentUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Inspect Document</a>
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Administrator Notes (Optional)</Label>
                  <Input value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="e.g. Verified transfer slip against bank statement" className="h-10 rounded-xl bg-muted/40 text-xs" />
                </div>

                {isOwnRequest ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    You initiated this payout. Another administrator must approve it (segregation of duties).
                  </div>
                ) : (
                  <label className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-900 dark:text-red-200 flex items-start gap-2.5 cursor-pointer">
                    <Checkbox id="confirm-final-payout-deletion" checked={confirmDeletion} onCheckedChange={v => setConfirmDeletion(v === true)} className="mt-0.5" />
                    <span className="leading-relaxed">
                      I confirm that <strong>{formatCurrency(selected.totalPayout, currency)}</strong> has been paid to <strong>{selected.memberName}</strong>.
                      Approving will <strong>permanently delete</strong> their account and login. This cannot be undone.
                    </span>
                  </label>
                )}
              </div>

              <DialogFooter className="p-4 sm:p-6 pt-3 bg-muted/30 border-t flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {canApprove ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => { setRejectionReason(''); setIsRejectOpen(true); }} className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 order-2 md:order-1">
                      <Ban className="mr-2 h-4 w-4" /> Reject
                    </Button>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 order-1 md:order-2">
                      <Button type="button" variant="ghost" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-11 px-4">Close</Button>
                      <Button
                        id="approve-final-payout-btn"
                        type="button"
                        variant="destructive"
                        disabled={isSubmitting || isOwnRequest || !confirmDeletion}
                        onClick={handleApprove}
                        className="rounded-xl font-bold shadow-lg h-11 px-5 gap-2"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve Payout & Delete Member
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 text-xs text-muted-foreground p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <strong>Review only:</strong> You can inspect this payout. Final approval requires an Administrator.
                    </div>
                    <Button type="button" variant="ghost" onClick={() => setIsReviewOpen(false)} className="rounded-xl font-bold h-11 px-4">Close</Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== REJECT DIALOG ===== */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Reject Final Payout</DialogTitle>
            <DialogDescription className="text-xs">The member account will remain active and unchanged.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Reason for rejection..." rows={3} className="rounded-xl text-xs resize-none" />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsRejectOpen(false)} className="rounded-xl font-bold">Cancel</Button>
            <Button variant="destructive" disabled={isSubmitting || !rejectionReason.trim()} onClick={handleReject} className="rounded-xl font-bold gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== EXPORT FINAL PAYOUTS DIALOG ===== */}
      {canExport && (
        <ExportFinalPayoutsDialog
          open={isExportDialogOpen}
          onOpenChange={setIsExportDialogOpen}
          payouts={payouts}
          currency={currency}
          currentUser={{
            name: userData?.name || user?.displayName || user?.email,
            email: user?.email,
            role: role,
          }}
          initialStatusFilter="all"
        />
      )}
    </div>
  );
}
