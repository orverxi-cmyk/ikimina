'use client';

import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Loader2, 
  Users, 
  DollarSign, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  Send,
  Eye,
  CheckCheck,
  Ban,
  UserCheck,
  FileCheck,
  Layers,
  History,
  AlertTriangle,
  Search,
  Receipt,
  CheckSquare,
  RotateCcw,
  Undo2
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, limit, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';
import { format, subMonths } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  downloadStaffContributionTemplate, 
  parseStaffContributionExcel, 
  ParsedContributionRow, 
  ParseResult, 
  RegisteredMember 
} from '@/lib/excel-template';
import { 
  initiateContributionBatchAction, 
  reviewContributionBatchAction, 
  approveContributionBatchAction,
  bulkReviewContributionBatchesAction,
  bulkApproveContributionBatchesAction,
  bulkVerifyContributionsAction,
  bulkRejectContributionsAction,
  reverseContributionAction,
  bulkReverseContributionsAction
} from '@/lib/finance-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import Link from 'next/link';

export default function AdminContributionsBulkUploadPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { settings } = useSettings();
  const currency = settings.currency || 'RWF';

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole = userData?.role || 'member';
  const isSuperAdmin = userRole === 'admin';
  const isReviewer = userRole === 'reviewer' || userRole === 'management' || userRole === 'admin';
  const isAccountant = userRole === 'accountant' || userRole === 'admin';

  // Active Tab
  const defaultTab = isSuperAdmin ? 'superadmin' : isReviewer && !isAccountant ? 'review' : 'initiate';
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Form & Parsing States (Initiator / Accountant)
  const [batchTitle, setBatchTitle] = useState<string>('Staff Contributions Population');
  const [batchType, setBatchType] = useState<'historical_migration' | 'payroll_deduction'>('historical_migration');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(format(new Date(), 'MMMM yyyy'));
  const [justification, setJustification] = useState<string>(`Existing contributions upload for ${format(new Date(), 'MMMM yyyy')}`);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeRows, setActiveRows] = useState<ParsedContributionRow[]>([]);

  // Inspect / Action Modal States
  const [inspectBatch, setInspectBatch] = useState<any | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Multi-Batch Bulk Review States
  const [selectedReviewBatchIds, setSelectedReviewBatchIds] = useState<string[]>([]);
  const [isBulkReviewOpen, setIsBulkReviewOpen] = useState(false);
  const [bulkReviewDecision, setBulkReviewDecision] = useState<'endorse' | 'request_changes' | 'reject'>('endorse');
  const [bulkReviewNotes, setBulkReviewNotes] = useState('');

  // Multi-Batch Bulk Approval States
  const [selectedApprovalBatchIds, setSelectedApprovalBatchIds] = useState<string[]>([]);
  const [isBulkApprovalOpen, setIsBulkApprovalOpen] = useState(false);
  const [bulkApprovalDecision, setBulkApprovalDecision] = useState<'approve' | 'reject'>('approve');
  const [bulkApprovalNotes, setBulkApprovalNotes] = useState('');

  // Pending Member Slips States
  const [selectedPendingSlipIds, setSelectedPendingSlipIds] = useState<string[]>([]);
  const [isBulkSlipModalOpen, setIsBulkSlipModalOpen] = useState(false);
  const [bulkSlipDecision, setBulkSlipDecision] = useState<'verify' | 'reject'>('verify');
  const [bulkSlipJustification, setBulkSlipJustification] = useState('');

  // Reversal States (Admin Area)
  const [selectedVerifiedContributionIds, setSelectedVerifiedContributionIds] = useState<string[]>([]);
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [targetContributionToReverse, setTargetContributionToReverse] = useState<any | null>(null);
  const [reversalJustification, setReversalJustification] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [historySubTab, setHistorySubTab] = useState<'batches' | 'verified_slips' | 'reversed_slips'>('batches');

  // Inspect Modal Search
  const [inspectSearchTerm, setInspectSearchTerm] = useState('');

  // Firestore Queries
  const membersQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);

  const batchesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contribution_batches'), orderBy('initiatedAt', 'desc'), limit(50));
  }, [firestore]);
  const { data: batchesSnap } = useCollection(batchesQuery);

  const pendingSlipsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contributions'), where('status', '==', 'pending'), limit(100));
  }, [firestore]);
  const { data: pendingSlipsSnap } = useCollection(pendingSlipsQuery);

  const verifiedContributionsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contributions'), where('status', '==', 'verified'), limit(150));
  }, [firestore]);
  const { data: verifiedContributionsSnap } = useCollection(verifiedContributionsQuery);

  const reversedContributionsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contributions'), where('status', '==', 'reversed'), limit(100));
  }, [firestore]);
  const { data: reversedContributionsSnap } = useCollection(reversedContributionsQuery);

  const pendingSlips = useMemo(() => {
    return pendingSlipsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
  }, [pendingSlipsSnap]);

  const verifiedContributions = useMemo(() => {
    return verifiedContributionsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
  }, [verifiedContributionsSnap]);

  const reversedContributions = useMemo(() => {
    return reversedContributionsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
  }, [reversedContributionsSnap]);

  const registeredMembers: RegisteredMember[] = useMemo(() => {
    return (membersSnap?.docs.map((d) => ({
      id: d.id,
      name: d.data().name || 'Unknown',
      email: d.data().email || '',
      phone: d.data().phone || '',
      role: d.data().role || 'member',
      avatarUrl: d.data().avatarUrl || ''
    })) || []) as RegisteredMember[];
  }, [membersSnap]);

  const allBatches = useMemo(() => {
    return batchesSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
  }, [batchesSnap]);

  // Filter batches by 3-tier lifecycle stages
  const pendingReviewBatches = useMemo(() => {
    return allBatches.filter((b: any) => b.status === 'pending_review' || b.status === 'revision_requested');
  }, [allBatches]);

  const pendingApprovalBatches = useMemo(() => {
    return allBatches.filter((b: any) => b.status === 'pending_approval');
  }, [allBatches]);

  const approvedBatches = useMemo(() => {
    return allBatches.filter((b: any) => b.status === 'approved');
  }, [allBatches]);

  // Bulk Computed Metrics & Selection Toggles
  const selectedReviewBatches = useMemo(() => {
    return pendingReviewBatches.filter((b: any) => selectedReviewBatchIds.includes(b.batchId || b.id));
  }, [pendingReviewBatches, selectedReviewBatchIds]);

  const bulkReviewTotalStaff = useMemo(() => {
    return selectedReviewBatches.reduce((acc: number, b: any) => acc + (b.totalCount || 0), 0);
  }, [selectedReviewBatches]);

  const bulkReviewTotalAmount = useMemo(() => {
    return selectedReviewBatches.reduce((acc: number, b: any) => acc + (Number(b.totalAmount) || 0), 0);
  }, [selectedReviewBatches]);

  const selectedApprovalBatches = useMemo(() => {
    return pendingApprovalBatches.filter((b: any) => selectedApprovalBatchIds.includes(b.batchId || b.id));
  }, [pendingApprovalBatches, selectedApprovalBatchIds]);

  const bulkApprovalTotalStaff = useMemo(() => {
    return selectedApprovalBatches.reduce((acc: number, b: any) => acc + (b.totalCount || 0), 0);
  }, [selectedApprovalBatches]);

  const bulkApprovalTotalAmount = useMemo(() => {
    return selectedApprovalBatches.reduce((acc: number, b: any) => acc + (Number(b.totalAmount) || 0), 0);
  }, [selectedApprovalBatches]);

  const toggleSelectAllReviewBatches = () => {
    if (selectedReviewBatchIds.length === pendingReviewBatches.length) {
      setSelectedReviewBatchIds([]);
    } else {
      setSelectedReviewBatchIds(pendingReviewBatches.map((b: any) => b.batchId || b.id));
    }
  };

  const toggleReviewBatch = (batchId: string) => {
    setSelectedReviewBatchIds(prev => 
      prev.includes(batchId) ? prev.filter(id => id !== batchId) : [...prev, batchId]
    );
  };

  const toggleSelectAllApprovalBatches = () => {
    if (selectedApprovalBatchIds.length === pendingApprovalBatches.length) {
      setSelectedApprovalBatchIds([]);
    } else {
      setSelectedApprovalBatchIds(pendingApprovalBatches.map((b: any) => b.batchId || b.id));
    }
  };

  const toggleApprovalBatch = (batchId: string) => {
    setSelectedApprovalBatchIds(prev => 
      prev.includes(batchId) ? prev.filter(id => id !== batchId) : [...prev, batchId]
    );
  };

  const toggleSelectAllSlips = () => {
    if (selectedPendingSlipIds.length === pendingSlips.length) {
      setSelectedPendingSlipIds([]);
    } else {
      setSelectedPendingSlipIds(pendingSlips.map((s: any) => s.id));
    }
  };

  const toggleSlip = (slipId: string) => {
    setSelectedPendingSlipIds(prev => 
      prev.includes(slipId) ? prev.filter(id => id !== slipId) : [...prev, slipId]
    );
  };

  const toggleSelectAllVerifiedContributions = () => {
    if (selectedVerifiedContributionIds.length === verifiedContributions.length) {
      setSelectedVerifiedContributionIds([]);
    } else {
      setSelectedVerifiedContributionIds(verifiedContributions.map((c: any) => c.id));
    }
  };

  const toggleVerifiedContribution = (contribId: string) => {
    setSelectedVerifiedContributionIds(prev => 
      prev.includes(contribId) ? prev.filter(id => id !== contribId) : [...prev, contribId]
    );
  };

  const filteredInspectItems = useMemo(() => {
    if (!inspectBatch?.items) return [];
    if (!inspectSearchTerm.trim()) return inspectBatch.items;
    const term = inspectSearchTerm.toLowerCase();
    return inspectBatch.items.filter((item: any) => 
      (item.staffName && item.staffName.toLowerCase().includes(term)) ||
      (item.staffEmail && item.staffEmail.toLowerCase().includes(term)) ||
      (item.period && item.period.toLowerCase().includes(term))
    );
  }, [inspectBatch, inspectSearchTerm]);


  // Derived statistics for staged rows
  const stats = useMemo(() => {
    const total = activeRows.length;
    const valid = activeRows.filter((r) => r.status === 'valid').length;
    const unmatched = activeRows.filter((r) => r.status === 'unmatched').length;
    const invalidAmount = activeRows.filter((r) => r.status === 'invalid_amount').length;
    const sum = activeRows
      .filter((r) => r.status === 'valid')
      .reduce((acc, r) => acc + (r.amount || 0), 0);

    return { total, valid, unmatched, invalidAmount, sum };
  }, [activeRows]);

  // Handle template download
  const handleDownloadBlankTemplate = () => {
    downloadStaffContributionTemplate({
      period: selectedPeriod,
      defaultAmount: 50000,
      fileName: `Staff_Contributions_Template_Blank_${selectedPeriod.replace(/\s+/g, '_')}.xlsx`
    });
    toast({
      title: "Template Downloaded",
      description: "Excel template saved. Fill in staff emails, amounts, and periods."
    });
  };

  const handleDownloadPrefilledTemplate = () => {
    if (registeredMembers.length === 0) {
      toast({
        variant: "destructive",
        title: "No Members Found",
        description: "Waiting for registered members list to load."
      });
      return;
    }
    downloadStaffContributionTemplate({
      prefillMembers: registeredMembers,
      period: selectedPeriod,
      defaultAmount: 50000,
      fileName: `Staff_Contributions_Prefilled_${selectedPeriod.replace(/\s+/g, '_')}.xlsx`
    });
    toast({
      title: "Pre-filled Template Downloaded",
      description: `Exported ${registeredMembers.length} active registered staff members into Excel.`
    });
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseStaffContributionExcel(buffer, registeredMembers);

      setActiveRows(result.rows);

      if (result.detectedPeriod) {
        setSelectedPeriod(result.detectedPeriod);
        setJustification(`Existing contributions upload for ${result.detectedPeriod}`);
      }

      toast({
        title: "Spreadsheet Parsed",
        description: `Parsed ${result.totalRows} records: ${result.validRows} matched, ${result.unmatchedRows} unmatched.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Spreadsheet Parse Error",
        description: err.message || "Failed to parse file. Please ensure it is a valid .xlsx or .csv."
      });
      setUploadedFile(null);
      setActiveRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  // Manual matching of an unmatched row
  const handleManualMemberMatch = (rowIndex: number, memberId: string) => {
    const targetMember = registeredMembers.find((m) => m.id === memberId);
    if (!targetMember) return;

    setActiveRows((prev) => {
      const updated = [...prev];
      const targetRow = { ...updated[rowIndex] };

      targetRow.memberId = targetMember.id;
      targetRow.matchedMember = targetMember;
      targetRow.staffName = targetMember.name;
      targetRow.staffEmail = targetMember.email;

      if (targetRow.amount > 0) {
        targetRow.status = 'valid';
        targetRow.errorMessage = undefined;
      } else {
        targetRow.status = 'invalid_amount';
        targetRow.errorMessage = 'Contribution amount must be greater than 0.';
      }

      updated[rowIndex] = targetRow;
      return updated;
    });
  };

  // Inline amount edit
  const handleAmountChange = (rowIndex: number, newAmount: number) => {
    setActiveRows((prev) => {
      const updated = [...prev];
      const targetRow = { ...updated[rowIndex] };
      targetRow.amount = newAmount;

      if (newAmount > 0 && targetRow.matchedMember) {
        targetRow.status = 'valid';
        targetRow.errorMessage = undefined;
      } else if (newAmount <= 0) {
        targetRow.status = 'invalid_amount';
        targetRow.errorMessage = 'Contribution amount must be greater than 0.';
      }

      updated[rowIndex] = targetRow;
      return updated;
    });
  };

  // Delete row
  const handleDeleteRow = (rowIndex: number) => {
    setActiveRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
  };

  // STEP 1: Accountant Initiates Batch
  const handleInitiateBatch = async () => {
    const validRows = activeRows.filter((r) => r.status === 'valid' && r.memberId && r.amount > 0);

    if (validRows.length === 0) {
      toast({
        variant: "destructive",
        title: "No Valid Records",
        description: "Please resolve unmatched members or invalid amounts before initiating."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: batchTitle.trim() || `Contributions Batch - ${selectedPeriod}`,
        type: batchType,
        defaultPeriod: selectedPeriod,
        justification: justification.trim() || `Populate contributions for ${selectedPeriod}`,
        items: validRows.map((r) => ({
          memberId: r.memberId!,
          amount: r.amount,
          period: r.period || selectedPeriod,
          deductionDate: r.deductionDate || undefined,
          notes: r.notes || `${batchTitle} - ${selectedPeriod}`,
          staffName: r.staffName,
          staffEmail: r.staffEmail
        }))
      };

      const result = await initiateContributionBatchAction(payload);

      toast({
        title: "Batch Initiated for Review (Step 1 Complete)",
        description: `Batch ${result.batchId} submitted! Forwarded to the Reviewer for compliance verification.`
      });

      // Reset form
      setUploadedFile(null);
      setActiveRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setActiveTab('review');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Batch Initiation Failed",
        description: err.message || "Failed to initiate batch."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // STEP 2: Reviewer Decision (Endorse, Request Changes, Reject)
  const handleReviewDecision = async (decision: 'endorse' | 'request_changes' | 'reject') => {
    if (!inspectBatch) return;
    if (!reviewNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Review Notes Required",
        description: "Please enter your review observations or recommendations."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await reviewContributionBatchAction({
        batchId: inspectBatch.batchId || inspectBatch.id,
        decision,
        reviewNotes: reviewNotes.trim()
      });

      toast({
        title: decision === 'endorse' 
          ? "Batch Endorsed (Step 2 Complete)" 
          : decision === 'request_changes' 
          ? "Revisions Requested" 
          : "Batch Rejected",
        description: decision === 'endorse' 
          ? "Forwarded to the Super Administrator for final approval." 
          : "Status updated in batch audit trail."
      });

      setIsInspectOpen(false);
      setInspectBatch(null);
      setReviewNotes('');
      if (decision === 'endorse') {
        setActiveTab('superadmin');
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Review Action Failed",
        description: err.message || "Could not submit review decision."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // STEP 3: Super Administrator Final Approval & Ledger Commit
  const handleApprovalDecision = async (decision: 'approve' | 'reject') => {
    if (!inspectBatch) return;
    if (!approvalNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Approval Notes Required",
        description: "Please enter your audit sign-off note before committing."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await approveContributionBatchAction({
        batchId: inspectBatch.batchId || inspectBatch.id,
        decision,
        approvalNotes: approvalNotes.trim()
      });

      if (decision === 'approve') {
        toast({
          title: "Batch Approved & Committed to Ledger!",
          description: `Successfully credited ${result.count} member contributions (${formatCurrency(result.totalAmount || 0, currency)}) to verified savings balances.`
        });
      } else {
        toast({
          title: "Batch Rejected",
          description: "Batch has been archived and marked rejected."
        });
      }

      setIsInspectOpen(false);
      setInspectBatch(null);
      setApprovalNotes('');
      setActiveTab('history');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Approval Action Failed",
        description: err.message || "Could not commit batch to ledger."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // BULK ACTION HANDLERS
  const handleExecuteBulkReview = async () => {
    if (selectedReviewBatchIds.length === 0) return;
    if (!bulkReviewNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Review Notes Required",
        description: "Please enter your review observations for the selected batches."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkReviewContributionBatchesAction({
        batchIds: selectedReviewBatchIds,
        decision: bulkReviewDecision,
        reviewNotes: bulkReviewNotes.trim()
      });

      toast({
        title: bulkReviewDecision === 'endorse' 
          ? `Bulk Endorsed (${result.processedCount} Batches)` 
          : bulkReviewDecision === 'request_changes'
          ? `Bulk Revisions Requested (${result.processedCount} Batches)`
          : `Bulk Rejected (${result.processedCount} Batches)`,
        description: `Successfully processed ${result.processedCount} out of ${result.totalRequested} batches.`
      });

      setSelectedReviewBatchIds([]);
      setIsBulkReviewOpen(false);
      setBulkReviewNotes('');
      if (bulkReviewDecision === 'endorse') {
        setActiveTab('superadmin');
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Bulk Review Failed",
        description: err.message || "Failed to process bulk review."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteBulkApproval = async () => {
    if (selectedApprovalBatchIds.length === 0) return;
    if (!bulkApprovalNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Approval Notes Required",
        description: "Please enter the executive audit approval note before committing."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkApproveContributionBatchesAction({
        batchIds: selectedApprovalBatchIds,
        decision: bulkApprovalDecision,
        approvalNotes: bulkApprovalNotes.trim()
      });

      if (bulkApprovalDecision === 'approve') {
        toast({
          title: `Bulk Approved & Committed! (${result.processedBatches} Batches)`,
          description: `Authoritatively credited ${result.totalItemsCommitted} staff contributions totaling ${formatCurrency(result.totalAmountCommitted, currency)} into verified member savings!`
        });
        setActiveTab('history');
      } else {
        toast({
          title: `Bulk Rejected (${result.processedBatches} Batches)`,
          description: "Selected batches have been rejected and archived."
        });
      }

      setSelectedApprovalBatchIds([]);
      setIsBulkApprovalOpen(false);
      setBulkApprovalNotes('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Bulk Approval Failed",
        description: err.message || "Failed to process bulk approval."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteBulkSlipAction = async () => {
    if (selectedPendingSlipIds.length === 0) return;
    if (!bulkSlipJustification.trim()) {
      toast({
        variant: "destructive",
        title: "Justification Required",
        description: "Please enter a justification or rejection reason."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (bulkSlipDecision === 'verify') {
        const result = await bulkVerifyContributionsAction({
          contributionIds: selectedPendingSlipIds,
          justification: bulkSlipJustification.trim()
        });
        toast({
          title: `Bulk Verified (${result.count} Member Slips)`,
          description: "All selected contributions are now verified and added to member balances."
        });
      } else {
        const result = await bulkRejectContributionsAction({
          contributionIds: selectedPendingSlipIds,
          rejectionReason: bulkSlipJustification.trim()
        });
        toast({
          title: `Bulk Rejected (${result.count} Member Slips)`,
          description: "Selected contribution slips have been rejected."
        });
      }

      setSelectedPendingSlipIds([]);
      setIsBulkSlipModalOpen(false);
      setBulkSlipJustification('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Bulk Slip Action Failed",
        description: err.message || "Failed to update contribution slips."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteReversal = async () => {
    if (!reversalJustification.trim()) {
      toast({
        variant: "destructive",
        title: "Justification Required",
        description: "Please enter an audit reason for reversing the contribution approval."
      });
      return;
    }

    setIsReversing(true);
    try {
      if (targetContributionToReverse) {
        await reverseContributionAction({
          contributionId: targetContributionToReverse.id,
          justification: reversalJustification.trim()
        });
        toast({
          title: "Approval Reversed",
          description: `Contribution of ${formatCurrency(targetContributionToReverse.amount || 0, currency)} has been marked reversed and deducted from member savings.`
        });
      } else if (selectedVerifiedContributionIds.length > 0) {
        const result = await bulkReverseContributionsAction({
          contributionIds: selectedVerifiedContributionIds,
          justification: reversalJustification.trim()
        });
        toast({
          title: `Bulk Approvals Reversed (${result.count} Records)`,
          description: "All selected contributions have been reversed and deducted from verified member balances."
        });
      }

      setIsReverseModalOpen(false);
      setTargetContributionToReverse(null);
      setSelectedVerifiedContributionIds([]);
      setReversalJustification('');
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Reversal Failed",
        description: err.message || "Failed to reverse contribution approval."
      });
    } finally {
      setIsReversing(false);
    }
  };

  const periodOptions = [
    format(new Date(), 'MMMM yyyy'),
    format(subMonths(new Date(), 1), 'MMMM yyyy'),
    format(subMonths(new Date(), 2), 'MMMM yyyy'),
    format(subMonths(new Date(), 3), 'MMMM yyyy')
  ];

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-16 w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase font-bold tracking-wider">
              Three-Tier Governance Workflow
            </Badge>
            <Badge variant="outline" className="text-[9px] uppercase font-medium">
              Maker • Checker • Approver
            </Badge>
          </div>
          <h1 className="text-[13px] font-bold font-headline tracking-tight text-foreground">
            Populate Existing &amp; Staff Contributions
          </h1>
          <p className="text-[12px] font-bold text-muted-foreground mt-0.5 max-w-3xl">
            Controlled migration and population of member savings: <strong>Accountant</strong> initiates the Excel upload &rarr; <strong>Reviewer</strong> validates compliance &rarr; <strong>Super Admin</strong> grants final approval to commit to the official ledger.
          </p>
        </div>

        {/* Template Downloads */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadBlankTemplate}
            className="rounded-xl font-bold text-[12px] gap-2 bg-card hover:bg-muted/60 flex-1 sm:flex-none"
          >
            <Download className="h-4 w-4 text-primary" />
            Blank Template
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPrefilledTemplate}
            disabled={loadingMembers}
            className="rounded-xl font-bold text-[12px] gap-2 shadow-sm flex-1 sm:flex-none"
          >
            <Sparkles className="h-4 w-4" />
            Pre-filled Template ({registeredMembers.length} Staff)
          </Button>
        </div>
      </div>

      {/* Governance Workflow Stepper Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1 */}
        <Card className={cn(
          "border transition-all",
          activeTab === 'initiate' ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"
        )}>
          <CardContent className="pt-5 pb-5 flex items-start gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl shrink-0 font-bold text-xs">
              01
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Step 1: Initiate (Maker)</p>
              <h4 className="font-bold text-sm text-foreground mt-0.5">Accountant Upload</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Uploads Excel file, matches staff accounts, and submits batch for verification.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card className={cn(
          "border transition-all",
          activeTab === 'review' ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"
        )}>
          <CardContent className="pt-5 pb-5 flex items-start gap-3">
            <div className="p-2.5 bg-purple-500/10 text-purple-600 rounded-xl shrink-0 font-bold text-xs">
              02
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">Step 2: Check (Reviewer)</p>
                {pendingReviewBatches.length > 0 && (
                  <Badge className="bg-purple-600 text-white border-none text-[9px] font-mono">
                    {pendingReviewBatches.length} Pending
                  </Badge>
                )}
              </div>
              <h4 className="font-bold text-sm text-foreground mt-0.5">Reviewer Inspection</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Verifies staff contribution amounts and endorses to the Super Admin.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card className={cn(
          "border transition-all",
          activeTab === 'superadmin' ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"
        )}>
          <CardContent className="pt-5 pb-5 flex items-start gap-3">
            <div className="p-2.5 bg-green-500/10 text-green-600 rounded-xl shrink-0 font-bold text-xs">
              03
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Step 3: Approve (Admin)</p>
                {pendingApprovalBatches.length > 0 && (
                  <Badge className="bg-green-600 text-white border-none text-[9px] font-mono animate-pulse">
                    {pendingApprovalBatches.length} Ready
                  </Badge>
                )}
              </div>
              <h4 className="font-bold text-sm text-foreground mt-0.5">Super Admin Sign-off</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Final audit approval; authoritatively commits records to official ledger.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-12 rounded-xl bg-muted/60 p-1 border">
          <TabsTrigger value="initiate" className="rounded-lg text-xs font-bold gap-1.5">
            <Upload className="h-4 w-4" /> 1. Initiate Upload
          </TabsTrigger>
          <TabsTrigger value="review" className="rounded-lg text-xs font-bold gap-1.5 relative">
            <UserCheck className="h-4 w-4" /> 2. Review Queue
            {pendingReviewBatches.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-purple-600 text-white rounded-full text-[10px]">
                {pendingReviewBatches.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="superadmin" className="rounded-lg text-xs font-bold gap-1.5 relative">
            <ShieldCheck className="h-4 w-4" /> 3. Super Admin
            {pendingApprovalBatches.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-green-600 text-white rounded-full text-[10px]">
                {pendingApprovalBatches.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="slips" className="rounded-lg text-xs font-bold gap-1.5 relative">
            <Receipt className="h-4 w-4" /> 4. Member Slips
            {pendingSlips.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px]">
                {pendingSlips.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg text-xs font-bold gap-1.5">
            <History className="h-4 w-4" /> 5. Committed Batches ({approvedBatches.length})
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: INITIATE BATCH (Accountant / Maker) */}
        {/* ============================================================ */}
        <TabsContent value="initiate" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2 shadow-sm border border-border">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Select Excel File to Populate Contributions
                </CardTitle>
                <CardDescription>
                  Upload past contribution sheets or current payroll deductions (.xlsx, .xls, .csv).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors rounded-2xl p-8 text-center cursor-pointer bg-muted/10 hover:bg-muted/20 flex flex-col items-center justify-center gap-3"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="p-4 bg-primary/10 rounded-full text-primary">
                    {isParsing ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <Upload className="h-8 w-8" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">
                      {uploadedFile ? uploadedFile.name : "Click to select or drag and drop Excel spreadsheet"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports Excel (.xlsx, .xls) and CSV format
                    </p>
                  </div>
                  {uploadedFile && (
                    <Badge variant="secondary" className="mt-2 text-xs font-mono">
                      {(uploadedFile.size / 1024).toFixed(1)} KB • {activeRows.length} rows parsed
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Batch Metadata */}
            <Card className="shadow-sm border border-border">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Batch Setup
                </CardTitle>
                <CardDescription>
                  Configure population purpose and accounting audit notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Batch Title</Label>
                  <Input 
                    value={batchTitle}
                    onChange={(e) => setBatchTitle(e.target.value)}
                    placeholder="e.g. Existing Contributions Backfill"
                    className="rounded-xl h-10 bg-muted/40 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Contribution Type</Label>
                  <Select value={batchType} onValueChange={(val: any) => setBatchType(val)}>
                    <SelectTrigger className="rounded-xl h-10 bg-muted/40 text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="historical_migration">Historical / Existing Savings</SelectItem>
                      <SelectItem value="payroll_deduction">Monthly Staff Payroll Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Default Period</Label>
                  <Select value={selectedPeriod} onValueChange={(val) => {
                    setSelectedPeriod(val);
                    setJustification(`Existing contributions upload for ${val}`);
                  }}>
                    <SelectTrigger className="rounded-xl h-10 bg-muted/40 text-xs">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {periodOptions.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider">Justification / Reference</Label>
                  <Textarea 
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Reference for this upload..."
                    rows={2}
                    className="rounded-xl bg-muted/40 resize-none text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staged Data Preview & Reconciliation */}
          {activeRows.length > 0 && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border border-border">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Rows</p>
                      <p className="text-2xl font-bold font-headline">{stats.total}</p>
                    </div>
                    <div className="p-2.5 bg-muted rounded-xl text-muted-foreground">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border border-green-500/20 bg-green-500/5">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-green-700 dark:text-green-400 font-bold uppercase tracking-wider">Matched (Valid)</p>
                      <p className="text-2xl font-bold font-headline text-green-700 dark:text-green-300">{stats.valid}</p>
                    </div>
                    <div className="p-2.5 bg-green-500/20 rounded-xl text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className={cn(
                  "shadow-sm border transition-colors",
                  stats.unmatched > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border"
                )}>
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        stats.unmatched > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                      )}>Unmatched Staff</p>
                      <p className={cn(
                        "text-2xl font-bold font-headline",
                        stats.unmatched > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                      )}>{stats.unmatched}</p>
                    </div>
                    <div className={cn(
                      "p-2.5 rounded-xl",
                      stats.unmatched > 0 ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground"
                    )}>
                      <AlertCircle className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border border-primary/20 bg-primary/5">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Total Value</p>
                      <p className="text-2xl font-bold font-headline text-primary">
                        {formatCurrency(stats.sum, currency)}
                      </p>
                    </div>
                    <div className="p-2.5 bg-primary/20 rounded-xl text-primary">
                      <DollarSign className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Table */}
              <Card className="shadow-sm border border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-bold">Review Staged Staff Entries</CardTitle>
                    <CardDescription className="text-xs">
                      Reconcile matched staff and amounts before submitting to the reviewer.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (uploadedFile) {
                        uploadedFile.arrayBuffer().then((buf) => {
                          parseStaffContributionExcel(buf, registeredMembers).then((res) => {
                            setActiveRows(res.rows);
                            toast({ title: "Reset", description: "Rows restored to spreadsheet data." });
                          });
                        });
                      }
                    }}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[450px]">
                    <Table>
                      <TableHeader className="bg-muted/40 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead className="min-w-[200px]">Staff Member</TableHead>
                          <TableHead className="min-w-[140px]">Email in File</TableHead>
                          <TableHead className="w-32 text-right">Amount ({currency})</TableHead>
                          <TableHead className="w-28">Period</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                          <TableHead className="w-12 text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRows.map((row, idx) => (
                          <TableRow 
                            key={idx} 
                            className={cn(
                              "transition-colors",
                              row.status === 'unmatched' && "bg-amber-500/5",
                              row.status === 'invalid_amount' && "bg-destructive/5"
                            )}
                          >
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">
                              {row.rowNumber}
                            </TableCell>

                            {/* Staff Matching */}
                            <TableCell>
                              {row.status === 'valid' && row.matchedMember ? (
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 border border-border shrink-0">
                                    <AvatarImage src={row.matchedMember.avatarUrl} />
                                    <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                      {row.matchedMember.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs truncate">{row.matchedMember.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{row.matchedMember.email}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    {row.staffName || 'Unknown Staff'}
                                  </p>
                                  <Select onValueChange={(val) => handleManualMemberMatch(idx, val)}>
                                    <SelectTrigger className="h-7 text-xs rounded-lg bg-background border-amber-500/40">
                                      <SelectValue placeholder="Map to registered member..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {registeredMembers.map((m) => (
                                        <SelectItem key={m.id} value={m.id} className="text-xs">
                                          {m.name} ({m.email})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[150px]">
                              {row.staffEmail || row.phone || '—'}
                            </TableCell>

                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={row.amount || ''}
                                onChange={(e) => handleAmountChange(idx, Number(e.target.value))}
                                className={cn(
                                  "h-8 text-right font-bold text-xs rounded-lg w-28 ml-auto",
                                  row.amount <= 0 && "border-destructive text-destructive"
                                )}
                              />
                            </TableCell>

                            <TableCell className="text-xs font-medium">
                              {row.period || selectedPeriod}
                            </TableCell>

                            <TableCell>
                              {row.status === 'valid' ? (
                                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-none text-[9px] uppercase font-bold">
                                  Matched
                                </Badge>
                              ) : row.status === 'unmatched' ? (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-none text-[9px] uppercase font-bold">
                                  Unmatched
                                </Badge>
                              ) : (
                                <Badge className="bg-destructive/15 text-destructive border-none text-[9px] uppercase font-bold">
                                  Invalid Amount
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteRow(idx)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-muted/10 border-t">
                  <div className="text-xs text-muted-foreground">
                    <strong>{stats.valid}</strong> matched staff ready to submit ({formatCurrency(stats.sum, currency)})
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setUploadedFile(null);
                        setActiveRows([]);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="rounded-xl font-bold flex-1 sm:flex-none"
                    >
                      Clear
                    </Button>

                    <Button
                      onClick={handleInitiateBatch}
                      disabled={isSubmitting || stats.valid === 0}
                      className="rounded-xl font-bold shadow-lg flex-1 sm:flex-none h-11 px-6 text-sm gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting Batch...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Submit Batch for Review (Step 1 of 3)
                        </>
                      )}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: REVIEW QUEUE (Reviewer / Checker) */}
        {/* ============================================================ */}
        <TabsContent value="review" className="space-y-6">
          <Card className="shadow-sm border border-border">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-purple-600" />
                    Reviewer Verification Queue (Step 2)
                  </CardTitle>
                  <CardDescription>
                    Batches initiated by accountants awaiting compliance check and endorsement.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-none font-bold">
                    {pendingReviewBatches.length} Awaiting Review
                  </Badge>
                  {pendingReviewBatches.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAllReviewBatches}
                      className="rounded-xl text-xs h-8 gap-1.5"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {selectedReviewBatchIds.length === pendingReviewBatches.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Bulk Action Toolbar */}
            {selectedReviewBatchIds.length > 0 && (
              <div className="p-3 bg-purple-500/10 border-y border-purple-500/20 flex flex-wrap items-center justify-between gap-3 px-6 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <Badge className="bg-purple-600 text-white font-bold text-xs">
                    {selectedReviewBatchIds.length} of {pendingReviewBatches.length} Selected
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Staff: <strong className="text-foreground">{bulkReviewTotalStaff}</strong> &bull; Total Value: <strong className="text-primary">{formatCurrency(bulkReviewTotalAmount, currency)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setBulkReviewDecision('endorse');
                      setBulkReviewNotes('Consolidated review completed. Endorsed to Super Admin for ledger credit.');
                      setIsBulkReviewOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Bulk Endorse ({selectedReviewBatchIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkReviewDecision('request_changes');
                      setBulkReviewNotes('');
                      setIsBulkReviewOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  >
                    Bulk Request Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkReviewDecision('reject');
                      setBulkReviewNotes('');
                      setIsBulkReviewOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-3.5 w-3.5" /> Bulk Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedReviewBatchIds([])}
                    className="rounded-xl h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-12 px-4 text-center">
                      <Checkbox
                        checked={pendingReviewBatches.length > 0 && selectedReviewBatchIds.length === pendingReviewBatches.length}
                        onCheckedChange={toggleSelectAllReviewBatches}
                        aria-label="Select all batches"
                      />
                    </TableHead>
                    <TableHead className="px-4">Batch ID / Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Initiator</TableHead>
                    <TableHead>Date Initiated</TableHead>
                    <TableHead>Staff Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right px-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReviewBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground text-xs italic">
                        No batches currently awaiting review. All batches are up to date!
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingReviewBatches.map((b: any) => {
                      const isSelected = selectedReviewBatchIds.includes(b.batchId || b.id);
                      return (
                        <TableRow 
                          key={b.id} 
                          className={cn(
                            "hover:bg-muted/30 transition-colors",
                            isSelected && "bg-purple-500/5"
                          )}
                        >
                          <TableCell className="w-12 px-4 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleReviewBatch(b.batchId || b.id)}
                              aria-label={`Select batch ${b.title || b.id}`}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <p className="font-bold text-xs text-foreground">{b.title || 'Staff Contributions'}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{b.batchId || b.id}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">
                              {b.type === 'historical_migration' ? 'Historical Migration' : 'Payroll Deduction'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-bold">{b.initiatorName || 'Accountant'}</span>
                            <span className="text-[10px] text-muted-foreground block capitalize">{b.initiatorRole}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {b.initiatedAt?.seconds 
                              ? format(new Date(b.initiatedAt.seconds * 1000), 'MMM d, yyyy HH:mm') 
                              : 'Just now'}
                          </TableCell>
                          <TableCell className="text-xs font-mono font-bold">
                            {b.totalCount} staff
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-primary">
                            {formatCurrency(b.totalAmount || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Button
                              size="sm"
                              onClick={() => {
                                setInspectBatch(b);
                                setInspectSearchTerm('');
                                setReviewNotes('');
                                setIsInspectOpen(true);
                              }}
                              className="rounded-xl h-8 text-xs font-bold gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              <Eye className="h-3.5 w-3.5" /> Inspect &amp; Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 3: SUPER ADMIN APPROVAL (Super Admin / Approver) */}
        {/* ============================================================ */}
        <TabsContent value="superadmin" className="space-y-6">
          <Card className="shadow-sm border border-border">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    Super Admin Final Approval Queue (Step 3)
                  </CardTitle>
                  <CardDescription>
                    Batches endorsed by the Reviewer, awaiting final sign-off to be committed to the official ledger.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-none font-bold">
                    {pendingApprovalBatches.length} Ready for Approval
                  </Badge>
                  {pendingApprovalBatches.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAllApprovalBatches}
                      className="rounded-xl text-xs h-8 gap-1.5"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {selectedApprovalBatchIds.length === pendingApprovalBatches.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Bulk Approval Action Toolbar */}
            {selectedApprovalBatchIds.length > 0 && (
              <div className="p-3 bg-green-500/10 border-y border-green-500/20 flex flex-wrap items-center justify-between gap-3 px-6 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-600 text-white font-bold text-xs">
                    {selectedApprovalBatchIds.length} of {pendingApprovalBatches.length} Selected
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Staff: <strong className="text-foreground">{bulkApprovalTotalStaff}</strong> &bull; Total Ledger Value: <strong className="text-primary">{formatCurrency(bulkApprovalTotalAmount, currency)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setBulkApprovalDecision('approve');
                      setBulkApprovalNotes(`Approved and released by Super Admin on ${format(new Date(), 'PPP')}`);
                      setIsBulkApprovalOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-md"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Bulk Approve &amp; Commit ({selectedApprovalBatchIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkApprovalDecision('reject');
                      setBulkApprovalNotes('');
                      setIsBulkApprovalOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-3.5 w-3.5" /> Bulk Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedApprovalBatchIds([])}
                    className="rounded-xl h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-12 px-4 text-center">
                      <Checkbox
                        checked={pendingApprovalBatches.length > 0 && selectedApprovalBatchIds.length === pendingApprovalBatches.length}
                        onCheckedChange={toggleSelectAllApprovalBatches}
                        aria-label="Select all batches"
                      />
                    </TableHead>
                    <TableHead className="px-4">Batch ID / Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Initiator</TableHead>
                    <TableHead>Reviewer Endorsement</TableHead>
                    <TableHead>Staff Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right px-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovalBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground text-xs italic">
                        No endorsed batches awaiting final Super Admin sign-off right now.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingApprovalBatches.map((b: any) => {
                      const isSelected = selectedApprovalBatchIds.includes(b.batchId || b.id);
                      return (
                        <TableRow 
                          key={b.id} 
                          className={cn(
                            "hover:bg-muted/30 transition-colors",
                            isSelected && "bg-green-500/5"
                          )}
                        >
                          <TableCell className="w-12 px-4 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleApprovalBatch(b.batchId || b.id)}
                              aria-label={`Select batch ${b.title || b.id}`}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <p className="font-bold text-xs text-foreground">{b.title || 'Staff Contributions'}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{b.batchId || b.id}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">
                              {b.type === 'historical_migration' ? 'Historical Migration' : 'Payroll Deduction'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-bold">{b.initiatorName || 'Accountant'}</span>
                            <span className="text-[10px] text-muted-foreground block">{b.defaultPeriod}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5 text-green-600 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>{b.reviewerName || 'Reviewer'}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic truncate max-w-[160px]">
                              &ldquo;{b.reviewNotes || 'Endorsed'}&rdquo;
                            </p>
                          </TableCell>
                          <TableCell className="text-xs font-mono font-bold">
                            {b.totalCount} staff
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-primary">
                            {formatCurrency(b.totalAmount || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Button
                              size="sm"
                              onClick={() => {
                                setInspectBatch(b);
                                setInspectSearchTerm('');
                                setApprovalNotes(`Approved and released by Super Admin on ${format(new Date(), 'PPP')}`);
                                setIsInspectOpen(true);
                              }}
                              className="rounded-xl h-8 text-xs font-bold gap-1 bg-green-600 hover:bg-green-700 text-white shadow-md"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Final Approve
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 4: MEMBER SLIPS QUEUE (Individual Pending Slips) */}
        {/* ============================================================ */}
        <TabsContent value="slips" className="space-y-6">
          <Card className="shadow-sm border border-border">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-amber-600" />
                    Member Self-Submitted Payment Slips
                  </CardTitle>
                  <CardDescription>
                    Individual savings contributions submitted by members requiring payment slip verification.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-none font-bold">
                    {pendingSlips.length} Slips Pending
                  </Badge>
                  {pendingSlips.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAllSlips}
                      className="rounded-xl text-xs h-8 gap-1.5"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {selectedPendingSlipIds.length === pendingSlips.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Bulk Slips Toolbar */}
            {selectedPendingSlipIds.length > 0 && (
              <div className="p-3 bg-amber-500/10 border-y border-amber-500/20 flex flex-wrap items-center justify-between gap-3 px-6 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <Badge className="bg-amber-600 text-white font-bold text-xs">
                    {selectedPendingSlipIds.length} of {pendingSlips.length} Slips Selected
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Selected Total: <strong className="text-foreground">
                      {formatCurrency(
                        pendingSlips
                          .filter((s: any) => selectedPendingSlipIds.includes(s.id))
                          .reduce((acc: number, s: any) => acc + (Number(s.amount) || 0), 0),
                        currency
                      )}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setBulkSlipDecision('verify');
                      setBulkSlipJustification(`Payment slip verified and bank deposit reconciled on ${format(new Date(), 'PPP')}`);
                      setIsBulkSlipModalOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Bulk Verify Slips ({selectedPendingSlipIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkSlipDecision('reject');
                      setBulkSlipJustification('');
                      setIsBulkSlipModalOpen(true);
                    }}
                    className="rounded-xl h-8 text-xs font-bold gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-3.5 w-3.5" /> Bulk Reject Slips
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedPendingSlipIds([])}
                    className="rounded-xl h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-12 px-4 text-center">
                      <Checkbox
                        checked={pendingSlips.length > 0 && selectedPendingSlipIds.length === pendingSlips.length}
                        onCheckedChange={toggleSelectAllSlips}
                        aria-label="Select all slips"
                      />
                    </TableHead>
                    <TableHead className="px-4">Member</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Submitted Date</TableHead>
                    <TableHead>Proof of Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right px-6">Quick Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingSlips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-xs italic">
                        No pending member contribution slips to review. All slips are processed!
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingSlips.map((s: any) => {
                      const isSelected = selectedPendingSlipIds.includes(s.id);
                      const memberMatch = registeredMembers.find(m => m.id === s.memberId);
                      return (
                        <TableRow 
                          key={s.id} 
                          className={cn(
                            "hover:bg-muted/30 transition-colors",
                            isSelected && "bg-amber-500/5"
                          )}
                        >
                          <TableCell className="w-12 px-4 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSlip(s.id)}
                              aria-label={`Select slip ${s.id}`}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <p className="font-bold text-xs text-foreground">{memberMatch?.name || s.staffName || 'Member'}</p>
                            <p className="text-[10px] text-muted-foreground">{memberMatch?.email || s.staffEmail || s.memberId}</p>
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {s.period || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.date?.seconds 
                              ? format(new Date(s.date.seconds * 1000), 'MMM d, yyyy HH:mm') 
                              : 'Just now'}
                          </TableCell>
                          <TableCell>
                            {s.proofUrl ? (
                              <a 
                                href={s.proofUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs text-primary underline font-medium hover:text-primary/80 inline-flex items-center gap-1"
                              >
                                View Slip Document &rarr;
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No slip attached</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-primary">
                            {formatCurrency(s.amount || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPendingSlipIds([s.id]);
                                setBulkSlipDecision('verify');
                                setBulkSlipJustification(`Verified slip for ${memberMatch?.name || s.memberId}`);
                                setIsBulkSlipModalOpen(true);
                              }}
                              className="rounded-xl h-8 text-xs font-bold gap-1 text-green-700 hover:bg-green-500/10 border-green-500/30"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 5: COMMITTED LEDGER & REVERSAL AUDIT HUB */}
        {/* ============================================================ */}
        <TabsContent value="history" className="space-y-6">
          {/* Sub Navigation for Tab 5 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant={historySubTab === 'batches' ? 'default' : 'outline'}
                onClick={() => setHistorySubTab('batches')}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <Layers className="h-3.5 w-3.5" />
                Committed Batches ({approvedBatches.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={historySubTab === 'verified_slips' ? 'default' : 'outline'}
                onClick={() => setHistorySubTab('verified_slips')}
                className={cn(
                  "rounded-xl text-xs font-bold gap-1.5",
                  historySubTab === 'verified_slips' && "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified Contributions Ledger ({verifiedContributions.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={historySubTab === 'reversed_slips' ? 'default' : 'outline'}
                onClick={() => setHistorySubTab('reversed_slips')}
                className={cn(
                  "rounded-xl text-xs font-bold gap-1.5",
                  historySubTab === 'reversed_slips' && "bg-amber-600 hover:bg-amber-700 text-white"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reversed Audit Trail ({reversedContributions.length})
              </Button>
            </div>

            <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs font-bold text-primary">
              <Link href="/contributions">
                View Member App Ledger <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {/* SUB-TAB 1: COMMITTED BATCHES */}
          {historySubTab === 'batches' && (
            <Card className="shadow-sm border border-border">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Committed Batches Ledger History
                </CardTitle>
                <CardDescription>
                  Permanent audit record of all populated contribution batches committed by the Super Administrator.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="px-6">Batch ID / Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Audit Sign-off Chain</TableHead>
                      <TableHead>Committed Date</TableHead>
                      <TableHead>Staff Records</TableHead>
                      <TableHead className="text-right">Total Credited</TableHead>
                      <TableHead className="text-right px-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedBatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-xs italic">
                          No approved batches committed to the ledger yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      approvedBatches.map((b: any) => (
                        <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-6 py-4">
                            <p className="font-bold text-xs text-foreground">{b.title || 'Staff Contributions'}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{b.batchId || b.id}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">
                              {b.type === 'historical_migration' ? 'Historical Migration' : 'Payroll Deduction'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <p className="text-[10px] text-muted-foreground">
                              Maker: <strong className="text-foreground">{b.initiatorName || 'Accountant'}</strong>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Reviewer: <strong className="text-foreground">{b.reviewerName || 'Reviewer'}</strong>
                            </p>
                            <p className="text-[10px] text-green-700 dark:text-green-400 font-bold">
                              Approver: {b.approverName || 'Super Admin'}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {b.approvedAt?.seconds 
                              ? format(new Date(b.approvedAt.seconds * 1000), 'MMM d, yyyy HH:mm') 
                              : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-mono font-bold">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {b.totalCount} staff
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-primary">
                            {formatCurrency(b.totalAmount || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setInspectBatch(b);
                                setIsInspectOpen(true);
                              }}
                              className="rounded-xl h-8 text-xs font-bold gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" /> Inspect Batch
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* SUB-TAB 2: VERIFIED CONTRIBUTIONS (WITH INDIVIDUAL & BULK REVERSAL) */}
          {historySubTab === 'verified_slips' && (
            <Card className="shadow-sm border border-border">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Verified Member Contributions ({verifiedContributions.length})
                  </CardTitle>
                  <CardDescription>
                    All active contributions verified and contributing to member borrowing power. Administrators can reverse approvals here.
                  </CardDescription>
                </div>

                {/* Bulk Reversal Action Button */}
                {selectedVerifiedContributionIds.length > 0 && (
                  <div className="flex items-center gap-3 bg-destructive/10 p-2 px-3 rounded-xl border border-destructive/20 animate-fade-in">
                    <span className="text-xs font-bold text-destructive">
                      {selectedVerifiedContributionIds.length} Selected
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setTargetContributionToReverse(null);
                        setIsReverseModalOpen(true);
                      }}
                      className="rounded-xl font-bold text-xs gap-1.5 shadow-sm"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Bulk Reverse Approvals ({selectedVerifiedContributionIds.length})
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-12 px-4 text-center">
                        <Checkbox
                          checked={
                            verifiedContributions.length > 0 &&
                            selectedVerifiedContributionIds.length === verifiedContributions.length
                          }
                          onCheckedChange={toggleSelectAllVerifiedContributions}
                          aria-label="Select all verified contributions"
                        />
                      </TableHead>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Approved Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right px-6">Reversal Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verifiedContributions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-xs italic">
                          No verified contributions recorded.
                        </TableCell>
                      </TableRow>
                    ) : (
                      verifiedContributions.map((c: any) => {
                        const isSelected = selectedVerifiedContributionIds.includes(c.id);
                        const member = registeredMembers.find(m => m.id === c.memberId);

                        return (
                          <TableRow key={c.id} className={cn("hover:bg-muted/30 transition-colors", isSelected && "bg-destructive/5")}>
                            <TableCell className="w-12 px-4 text-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleVerifiedContribution(c.id)}
                                aria-label={`Select contribution ${c.id}`}
                              />
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-7 w-7 border shrink-0">
                                  <AvatarImage src={member?.avatarUrl} />
                                  <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                    {(member?.name || c.staffName || 'M').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-bold text-xs text-foreground">{member?.name || c.staffName || 'Member'}</p>
                                  <p className="text-[10px] text-muted-foreground">{member?.email || c.staffEmail || c.memberId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {c.period || '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.verifiedAt?.seconds 
                                ? format(new Date(c.verifiedAt.seconds * 1000), 'MMM d, yyyy') 
                                : c.date?.seconds 
                                ? format(new Date(c.date.seconds * 1000), 'MMM d, yyyy') 
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[9px] uppercase font-bold">
                                {c.batchId ? 'Bulk Batch' : c.source === 'payroll_deduction' ? 'Payroll' : 'Member Slip'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs text-primary">
                              {formatCurrency(c.amount || 0, currency)}
                            </TableCell>
                            <TableCell className="text-right px-6">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setTargetContributionToReverse(c);
                                  setIsReverseModalOpen(true);
                                }}
                                className="rounded-xl h-8 text-xs font-bold gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Reverse Approval
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* SUB-TAB 3: REVERSED AUDIT TRAIL */}
          {historySubTab === 'reversed_slips' && (
            <Card className="shadow-sm border border-border">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-amber-600">
                  <RotateCcw className="h-5 w-5" />
                  Reversed Contribution Approvals Audit Log ({reversedContributions.length})
                </CardTitle>
                <CardDescription>
                  Full audit record of all contribution approvals reversed by administrators, including reasons and timestamps.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="px-6">Staff Member</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount Reversed</TableHead>
                      <TableHead>Reversed Date</TableHead>
                      <TableHead>Reversed By</TableHead>
                      <TableHead className="px-6">Audit Justification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reversedContributions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-28 text-center text-muted-foreground text-xs italic">
                          No contribution approvals have been reversed.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reversedContributions.map((r: any) => {
                        const member = registeredMembers.find(m => m.id === r.memberId);
                        return (
                          <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="px-6 py-4">
                              <p className="font-bold text-xs text-foreground">{member?.name || r.staffName || 'Member'}</p>
                              <p className="text-[10px] text-muted-foreground">{member?.email || r.staffEmail || r.memberId}</p>
                            </TableCell>
                            <TableCell className="text-xs font-medium">{r.period || '—'}</TableCell>
                            <TableCell className="font-bold text-xs text-destructive">
                              -{formatCurrency(r.amount || 0, currency)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.reversedAt?.seconds 
                                ? format(new Date(r.reversedAt.seconds * 1000), 'MMM d, yyyy HH:mm') 
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-foreground">
                              {r.reversedByName || r.reversedBy || 'Administrator'}
                            </TableCell>
                            <TableCell className="px-6 text-xs text-muted-foreground italic max-w-xs truncate">
                              &ldquo;{r.reversalJustification || 'Approval reversed by admin'}&rdquo;
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* BATCH INSPECTION & DECISION DIALOG (Shared by Reviewer & Admin) */}
      {/* ============================================================ */}
      <Dialog open={isInspectOpen} onOpenChange={setIsInspectOpen}>
        <DialogContent className="max-w-3xl rounded-2xl bg-card p-0 overflow-hidden shadow-2xl border border-border">
          {inspectBatch && (
            <div className="flex flex-col max-h-[90vh]">
              {/* Header */}
              <DialogHeader className="p-6 pb-4 bg-muted/20 border-b">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn(
                        "border-none text-[9px] uppercase font-bold tracking-widest",
                        inspectBatch.status === 'pending_review' && "bg-purple-500/10 text-purple-700 dark:text-purple-400",
                        inspectBatch.status === 'pending_approval' && "bg-green-500/10 text-green-700 dark:text-green-400",
                        inspectBatch.status === 'approved' && "bg-primary/10 text-primary"
                      )}>
                        {inspectBatch.status.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] uppercase font-mono font-medium">
                        ID: {inspectBatch.batchId || inspectBatch.id}
                      </Badge>
                    </div>
                    <DialogTitle className="text-xl font-bold font-headline">
                      {inspectBatch.title || 'Contribution Batch Details'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Inspect individual staff contribution entries, governance trail, and total sums.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Scrollable Content */}
              <div className="p-6 space-y-6 overflow-y-auto">
                {/* 3 Metric Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted/40 rounded-xl border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Staff</p>
                    <p className="text-xl font-bold text-foreground font-headline mt-1">{inspectBatch.totalCount} Members</p>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-xl border border-primary/20">
                    <p className="text-[10px] text-primary uppercase font-bold tracking-wider">Total Amount</p>
                    <p className="text-xl font-bold text-primary font-headline mt-1">{formatCurrency(inspectBatch.totalAmount, currency)}</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-xl border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Target Period</p>
                    <p className="text-base font-bold text-foreground mt-1 truncate">{inspectBatch.defaultPeriod || '—'}</p>
                  </div>
                </div>

                {/* Governance Chain */}
                <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Governance Audit Trail</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">1. Initiated By:</span>
                      <span className="font-bold">{inspectBatch.initiatorName} ({inspectBatch.initiatorRole})</span>
                    </div>
                    {inspectBatch.justification && (
                      <div className="p-2 bg-background rounded-lg border text-muted-foreground text-[11px] italic">
                        &ldquo;{inspectBatch.justification}&rdquo;
                      </div>
                    )}
                    {inspectBatch.reviewedBy && (
                      <div className="flex items-center justify-between pt-1 border-t">
                        <span className="text-muted-foreground">2. Reviewed By:</span>
                        <span className="font-bold text-purple-600">{inspectBatch.reviewerName}</span>
                      </div>
                    )}
                    {inspectBatch.reviewNotes && (
                      <div className="p-2 bg-purple-500/5 rounded-lg border border-purple-500/20 text-purple-900 dark:text-purple-300 text-[11px] italic">
                        Reviewer Note: &ldquo;{inspectBatch.reviewNotes}&rdquo;
                      </div>
                    )}
                    {inspectBatch.approvedBy && (
                      <div className="flex items-center justify-between pt-1 border-t">
                        <span className="text-muted-foreground">3. Approved By:</span>
                        <span className="font-bold text-green-600">{inspectBatch.approverName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Staged Items List with Search */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Staff Breakdown ({filteredInspectItems.length} of {inspectBatch.items?.length || 0} entries)
                    </p>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search name, email, period..."
                        value={inspectSearchTerm}
                        onChange={(e) => setInspectSearchTerm(e.target.value)}
                        className="h-8 pl-8 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
                    <Table>
                      <TableHeader className="bg-muted/40 sticky top-0">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase">Staff Name</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">Email</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">Period</TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInspectItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-20 text-center text-xs text-muted-foreground italic">
                              No staff records match &ldquo;{inspectSearchTerm}&rdquo;
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredInspectItems.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs font-bold py-2.5">{item.staffName || 'Staff Member'}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground py-2.5">{item.staffEmail || '—'}</TableCell>
                              <TableCell className="text-xs py-2.5">{item.period || inspectBatch.defaultPeriod}</TableCell>
                              <TableCell className="text-right text-xs font-bold py-2.5 text-primary">
                                {formatCurrency(item.amount, currency)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Decision Inputs based on Batch Status & User Role */}
                {inspectBatch.status === 'pending_review' && isReviewer && (
                  <div className="space-y-2 p-4 bg-purple-500/5 rounded-xl border border-purple-500/20">
                    <Label className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                      Reviewer Observations / Verification Note
                    </Label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="e.g. Verified against payroll register. Staff names and deductions verified. Endorsed for approval."
                      rows={2}
                      className="rounded-xl bg-background border text-xs resize-none"
                    />
                  </div>
                )}

                {inspectBatch.status === 'pending_approval' && isSuperAdmin && (
                  <div className="space-y-2 p-4 bg-green-500/5 rounded-xl border border-green-500/20">
                    <Label className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
                      Super Admin Final Approval Note
                    </Label>
                    <Textarea
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      placeholder="e.g. Authorized and released by Super Admin per board credit policy..."
                      rows={2}
                      className="rounded-xl bg-background border text-xs resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Footer Controls */}
              <DialogFooter className="p-6 pt-4 bg-muted/20 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setIsInspectOpen(false)}
                  className="rounded-xl font-bold h-11 px-4"
                >
                  Close
                </Button>

                {/* Reviewer Actions */}
                {inspectBatch.status === 'pending_review' && isReviewer && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => handleReviewDecision('reject')}
                      className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 text-xs"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => handleReviewDecision('request_changes')}
                      className="rounded-xl font-bold border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 h-11 px-4 text-xs"
                    >
                      Request Changes
                    </Button>
                    <Button
                      disabled={isSubmitting}
                      onClick={() => handleReviewDecision('endorse')}
                      className="rounded-xl font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md h-11 px-5 text-xs gap-1.5"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCheck className="h-4 w-4" />
                      )}
                      Endorse to Super Admin (Step 2)
                    </Button>
                  </div>
                )}

                {/* Super Admin Actions */}
                {inspectBatch.status === 'pending_approval' && isSuperAdmin && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => handleApprovalDecision('reject')}
                      className="rounded-xl font-bold border-destructive/30 text-destructive hover:bg-destructive/10 h-11 px-4 text-xs"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      disabled={isSubmitting}
                      onClick={() => handleApprovalDecision('approve')}
                      className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg h-11 px-6 text-sm gap-2"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Approve &amp; Commit to Ledger ({formatCurrency(inspectBatch.totalAmount, currency)})
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* BULK REVIEW DIALOG */}
      <Dialog open={isBulkReviewOpen} onOpenChange={setIsBulkReviewOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-purple-600" />
              Bulk Review ({selectedReviewBatchIds.length} Batches)
            </DialogTitle>
            <DialogDescription>
              Execute consolidated review decision across all selected contribution batches simultaneously.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Aggregated metrics */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Batches</p>
                <p className="text-lg font-bold text-foreground">{selectedReviewBatchIds.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Staff</p>
                <p className="text-lg font-bold text-foreground">{bulkReviewTotalStaff}</p>
              </div>
              <div>
                <p className="text-[10px] text-primary uppercase font-bold">Total Value</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(bulkReviewTotalAmount, currency)}</p>
              </div>
            </div>

            {/* Decision selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Review Decision</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={bulkReviewDecision === 'endorse' ? 'default' : 'outline'}
                  onClick={() => setBulkReviewDecision('endorse')}
                  className={cn(
                    "text-xs font-bold rounded-xl h-9",
                    bulkReviewDecision === 'endorse' && "bg-purple-600 hover:bg-purple-700 text-white"
                  )}
                >
                  <CheckCheck className="mr-1 h-3.5 w-3.5" /> Endorse (Step 2)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={bulkReviewDecision === 'request_changes' ? 'default' : 'outline'}
                  onClick={() => setBulkReviewDecision('request_changes')}
                  className={cn(
                    "text-xs font-bold rounded-xl h-9",
                    bulkReviewDecision === 'request_changes' && "bg-amber-600 hover:bg-amber-700 text-white"
                  )}
                >
                  Request Changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={bulkReviewDecision === 'reject' ? 'default' : 'outline'}
                  onClick={() => setBulkReviewDecision('reject')}
                  className={cn(
                    "text-xs font-bold rounded-xl h-9",
                    bulkReviewDecision === 'reject' && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  )}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </div>

            {/* Selected batches preview */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected Batches</p>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-border divide-y">
                {selectedReviewBatches.map((b: any) => (
                  <div key={b.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold">{b.title}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{b.batchId || b.id} &bull; {b.totalCount} staff</p>
                    </div>
                    <span className="font-bold text-primary">{formatCurrency(b.totalAmount || 0, currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Review Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                Reviewer Observations / Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={bulkReviewNotes}
                onChange={(e) => setBulkReviewNotes(e.target.value)}
                placeholder="Enter review findings and verification endorsement..."
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsBulkReviewOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleExecuteBulkReview}
              className={cn(
                "rounded-xl font-bold text-xs gap-1.5 shadow-md",
                bulkReviewDecision === 'endorse' && "bg-purple-600 hover:bg-purple-700 text-white",
                bulkReviewDecision === 'request_changes' && "bg-amber-600 hover:bg-amber-700 text-white",
                bulkReviewDecision === 'reject' && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Confirm {bulkReviewDecision === 'endorse' ? 'Bulk Endorsement' : bulkReviewDecision === 'request_changes' ? 'Bulk Change Request' : 'Bulk Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK APPROVAL DIALOG */}
      <Dialog open={isBulkApprovalOpen} onOpenChange={setIsBulkApprovalOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Bulk Super Admin Approval ({selectedApprovalBatchIds.length} Batches)
            </DialogTitle>
            <DialogDescription>
              Commit all staged contributions across {selectedApprovalBatchIds.length} batches to the live database ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/30 flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs text-green-950 dark:text-green-200">
                <strong>Executive Audit Action:</strong> Committing will write {bulkApprovalTotalStaff} contributions totaling <strong>{formatCurrency(bulkApprovalTotalAmount, currency)}</strong> to the official ledger with status <code>verified</code> and instantly update member borrowing limits.
              </p>
            </div>

            {/* Selected batches preview */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Batches Ready for Sign-Off</p>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-border divide-y">
                {selectedApprovalBatches.map((b: any) => (
                  <div key={b.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold">{b.title}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {b.batchId || b.id} &bull; Reviewer: {b.reviewerName || 'Endorsed'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-primary">{formatCurrency(b.totalAmount || 0, currency)}</span>
                      <p className="text-[10px] text-muted-foreground">{b.totalCount} staff</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approval Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                Super Admin Final Approval Note <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={bulkApprovalNotes}
                onChange={(e) => setBulkApprovalNotes(e.target.value)}
                placeholder="Enter executive justification for final ledger commitment..."
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsBulkApprovalOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleExecuteBulkApproval}
              className="rounded-xl font-bold text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-lg"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Approve &amp; Commit All to Ledger ({formatCurrency(bulkApprovalTotalAmount, currency)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK SLIPS VERIFY / REJECT DIALOG */}
      <Dialog open={isBulkSlipModalOpen} onOpenChange={setIsBulkSlipModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              {bulkSlipDecision === 'verify' ? 'Bulk Verify Member Slips' : 'Bulk Reject Member Slips'}
            </DialogTitle>
            <DialogDescription>
              {bulkSlipDecision === 'verify' 
                ? `Verify payment proof for ${selectedPendingSlipIds.length} member contributions.` 
                : `Reject ${selectedPendingSlipIds.length} contribution slips.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                {bulkSlipDecision === 'verify' ? 'Verification Justification' : 'Rejection Reason'} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={bulkSlipJustification}
                onChange={(e) => setBulkSlipJustification(e.target.value)}
                placeholder={bulkSlipDecision === 'verify' ? "e.g. Bank credit slip verified against account statements..." : "e.g. Unreadable receipt or invalid transaction ID..."}
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsBulkSlipModalOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleExecuteBulkSlipAction}
              className={cn(
                "rounded-xl font-bold text-xs gap-1.5 shadow-md",
                bulkSlipDecision === 'verify' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm {bulkSlipDecision === 'verify' ? 'Verification' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVERSE CONTRIBUTION APPROVAL DIALOG */}
      <Dialog open={isReverseModalOpen} onOpenChange={setIsReverseModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" /> Reverse Contribution Approval
            </DialogTitle>
            <DialogDescription>
              {targetContributionToReverse ? (
                <>
                  Reverse approval for <strong>{registeredMembers.find(m => m.id === targetContributionToReverse.memberId)?.name || targetContributionToReverse.staffName || 'Member'}</strong>&apos;s contribution of <strong>{formatCurrency(targetContributionToReverse.amount || 0, currency)}</strong>.
                </>
              ) : (
                <>
                  Bulk reverse approval for <strong>{selectedVerifiedContributionIds.length}</strong> selected verified contributions.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                Financial &amp; Audit Impact
              </p>
              <p>
                Reversing this approval sets status to <code>reversed</code>. The credited amount will be authoritatively deducted from verified member savings and their borrowing power will be immediately recalculated.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">
                Reversal Justification / Audit Note <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={reversalJustification}
                onChange={(e) => setReversalJustification(e.target.value)}
                placeholder="e.g. Inadvertent duplicate payroll credit, adjustment per payroll audit amendment..."
                rows={3}
                className="rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsReverseModalOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isReversing}
              onClick={handleExecuteReversal}
              className="rounded-xl font-bold text-xs gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md"
            >
              {isReversing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
