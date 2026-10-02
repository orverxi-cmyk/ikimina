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
  Sparkles
} from 'lucide-react';
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';
import { format, subMonths } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { 
  downloadStaffContributionTemplate, 
  parseStaffContributionExcel, 
  ParsedContributionRow, 
  ParseResult, 
  RegisteredMember 
} from '@/lib/excel-template';
import { bulkUploadContributionsAction } from '@/lib/finance-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

  // Form & UI States
  const [selectedPeriod, setSelectedPeriod] = useState<string>(format(new Date(), 'MMMM yyyy'));
  const [justification, setJustification] = useState<string>(`Staff payroll source deduction for ${format(new Date(), 'MMMM yyyy')}`);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [activeRows, setActiveRows] = useState<ParsedContributionRow[]>([]);
  const [uploadSuccessBatch, setUploadSuccessBatch] = useState<{ batchId: string; count: number; totalAmount: number } | null>(null);

  // Firestore Queries
  const membersQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: membersSnap, loading: loadingMembers } = useCollection(membersQuery);

  const batchesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'contribution_batches'), orderBy('createdAt', 'desc'), limit(10));
  }, [firestore]);
  const { data: batchesSnap } = useCollection(batchesQuery);

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

  const recentBatches = useMemo(() => {
    return batchesSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
  }, [batchesSnap]);

  // Derived statistics
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
      fileName: `Staff_Source_Deductions_Blank_${selectedPeriod.replace(/\s+/g, '_')}.xlsx`
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
      fileName: `Staff_Source_Deductions_Prefilled_${selectedPeriod.replace(/\s+/g, '_')}.xlsx`
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
    setUploadSuccessBatch(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseStaffContributionExcel(buffer, registeredMembers);

      setParseResult(result);
      setActiveRows(result.rows);

      if (result.detectedPeriod) {
        setSelectedPeriod(result.detectedPeriod);
        setJustification(`Staff payroll source deduction for ${result.detectedPeriod}`);
      }

      toast({
        title: "File Analyzed",
        description: `Parsed ${result.totalRows} records: ${result.validRows} matched, ${result.unmatchedRows} unmatched.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Spreadsheet Parse Error",
        description: err.message || "Failed to parse file. Please ensure it is a valid .xlsx or .csv."
      });
      setUploadedFile(null);
      setParseResult(null);
      setActiveRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  // Manual matching of an unmatched row to a registered user
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

      // Re-evaluate validity
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

  // Submit bulk contributions
  const handleCommitBulkUpload = async () => {
    const validRows = activeRows.filter((r) => r.status === 'valid' && r.memberId && r.amount > 0);

    if (validRows.length === 0) {
      toast({
        variant: "destructive",
        title: "No Valid Records",
        description: "Please resolve unmatched members or invalid amounts before posting."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        items: validRows.map((r) => ({
          memberId: r.memberId!,
          amount: r.amount,
          period: r.period || selectedPeriod,
          deductionDate: r.deductionDate || undefined,
          notes: r.notes || `Staff payroll deduction - ${selectedPeriod}`,
          staffName: r.staffName,
          staffEmail: r.staffEmail
        })),
        defaultPeriod: selectedPeriod,
        justification: justification.trim() || `Staff payroll deduction upload for ${selectedPeriod}`
      };

      const result = await bulkUploadContributionsAction(payload);

      setUploadSuccessBatch(result);
      toast({
        title: "Bulk Upload Complete",
        description: `Successfully posted and verified ${result.count} staff contributions (${formatCurrency(result.totalAmount, currency)}).`
      });

      // Clear current file & rows
      setUploadedFile(null);
      setParseResult(null);
      setActiveRows([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Bulk Upload Failed",
        description: err.message || "Failed to commit contributions to ledger."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const periodOptions = [
    format(new Date(), 'MMMM yyyy'),
    format(subMonths(new Date(), 1), 'MMMM yyyy'),
    format(subMonths(new Date(), 2), 'MMMM yyyy'),
    format(subMonths(new Date(), 3), 'MMMM yyyy')
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold tracking-widest">
              Accountant & Payroll Portal
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-medium">
              Source Deductions
            </Badge>
          </div>
          <h1 className="text-3xl font-headline font-bold tracking-tight">
            Staff Contributions Bulk Upload
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Import monthly staff source-deductions from Excel. Uploaded records are automatically audited, verified, and credited directly to each member&apos;s verified savings balance.
          </p>
        </div>

        {/* Template Downloads */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadBlankTemplate}
            className="rounded-xl font-bold gap-2 bg-card hover:bg-muted/60"
          >
            <Download className="h-4 w-4 text-primary" />
            Blank Template
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPrefilledTemplate}
            disabled={loadingMembers}
            className="rounded-xl font-bold gap-2 shadow-md"
          >
            <Sparkles className="h-4 w-4" />
            Pre-filled Template ({registeredMembers.length} Staff)
          </Button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {uploadSuccessBatch && (
        <Card className="border-green-500/30 bg-green-500/10 shadow-lg">
          <CardContent className="pt-6 pb-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/20 text-green-600 rounded-full">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-green-950 dark:text-green-200">
                  Bulk Deductions Ledger Posted Successfully!
                </h3>
                <p className="text-xs text-green-800 dark:text-green-300">
                  Batch ID: <span className="font-mono font-bold">{uploadSuccessBatch.batchId}</span> • {uploadSuccessBatch.count} contributions credited • Total: {formatCurrency(uploadSuccessBatch.totalAmount, currency)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white">
                <Link href="/contributions">
                  View in Contributions Ledger <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Upload & Period Configuration */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 shadow-sm border border-border">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Upload Monthly Payroll Excel File
            </CardTitle>
            <CardDescription>
              Select your completed spreadsheet (.xlsx, .xls, or .csv). Staff will be matched by email, phone, or name.
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
                  {uploadedFile ? uploadedFile.name : "Click to select or drag and drop Excel file"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
                </p>
              </div>
              {uploadedFile && (
                <Badge variant="secondary" className="mt-2 text-xs font-mono">
                  {(uploadedFile.size / 1024).toFixed(1)} KB • {activeRows.length} rows loaded
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Batch Configuration */}
        <Card className="shadow-sm border border-border">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Batch Parameters
            </CardTitle>
            <CardDescription>
              Specify period and audit information for this payroll cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Payroll Period</Label>
              <Select value={selectedPeriod} onValueChange={(val) => {
                setSelectedPeriod(val);
                setJustification(`Staff payroll source deduction for ${val}`);
              }}>
                <SelectTrigger className="rounded-xl h-11 bg-muted/40">
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
              <Label className="text-xs font-bold uppercase tracking-wider">Audit Justification</Label>
              <Textarea 
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Reason or reference for this bulk payroll deduction..."
                rows={3}
                className="rounded-xl bg-muted/40 resize-none text-xs"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 2: Live Parsed Data Review & Interactive Reconciliation */}
      {activeRows.length > 0 && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm border border-border">
              <CardContent className="pt-5 pb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Rows</p>
                  <p className="text-2xl font-bold font-headline">{stats.total}</p>
                </div>
                <div className="p-3 bg-muted rounded-xl text-muted-foreground">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-green-500/20 bg-green-500/5">
              <CardContent className="pt-5 pb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium uppercase tracking-wider">Ready to Post</p>
                  <p className="text-2xl font-bold font-headline text-green-700 dark:text-green-300">{stats.valid}</p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-xl text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              "shadow-sm border transition-colors",
              stats.unmatched > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border"
            )}>
              <CardContent className="pt-5 pb-5 flex items-center justify-between">
                <div>
                  <p className={cn(
                    "text-xs font-medium uppercase tracking-wider",
                    stats.unmatched > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                  )}>Unmatched Staff</p>
                  <p className={cn(
                    "text-2xl font-bold font-headline",
                    stats.unmatched > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                  )}>{stats.unmatched}</p>
                </div>
                <div className={cn(
                  "p-3 rounded-xl",
                  stats.unmatched > 0 ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground"
                )}>
                  <AlertCircle className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-primary/20 bg-primary/5">
              <CardContent className="pt-5 pb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-primary font-medium uppercase tracking-wider">Total Value</p>
                  <p className="text-2xl font-bold font-headline text-primary">
                    {formatCurrency(stats.sum, currency)}
                  </p>
                </div>
                <div className="p-3 bg-primary/20 rounded-xl text-primary">
                  <DollarSign className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Attention Banner if Unmatched */}
          {stats.unmatched > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  <strong>{stats.unmatched} staff rows</strong> could not be matched automatically. Use the inline dropdown in the table below to map each row to an existing registered member, or delete the row before posting.
                </p>
              </div>
            </div>
          )}

          {/* Table */}
          <Card className="shadow-sm border border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Review & Reconcile Entries</CardTitle>
                <CardDescription>
                  Review matched staff, amounts, and source deduction notes before finalizing.
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
                        toast({ title: "Reset", description: "Rows restored to original file data." });
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead className="min-w-[220px]">Staff Member</TableHead>
                      <TableHead className="min-w-[150px]">Email in File</TableHead>
                      <TableHead className="w-36 text-right">Amount ({currency})</TableHead>
                      <TableHead className="w-28">Period</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-16 text-center">Action</TableHead>
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

                        {/* Staff / Matcher */}
                        <TableCell>
                          {row.status === 'valid' && row.matchedMember ? (
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 border border-border">
                                <AvatarImage src={row.matchedMember.avatarUrl} />
                                <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                  {row.matchedMember.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-bold text-xs">{row.matchedMember.name}</p>
                                <p className="text-[10px] text-muted-foreground">{row.matchedMember.email}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                {row.staffName || 'Unknown Staff'}
                              </p>
                              {/* Member Selector for manual linking */}
                              <Select
                                onValueChange={(val) => handleManualMemberMatch(idx, val)}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-amber-500/40">
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

                        {/* Email / Reference */}
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.staffEmail || row.phone || '—'}
                        </TableCell>

                        {/* Editable Amount */}
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

                        {/* Period */}
                        <TableCell className="text-xs font-medium">
                          {row.period || selectedPeriod}
                        </TableCell>

                        {/* Status */}
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

                        {/* Delete row */}
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
            <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-muted/10 border-t">
              <div className="text-xs text-muted-foreground">
                Showing <strong>{activeRows.length}</strong> rows • <strong>{stats.valid}</strong> ready to commit ({formatCurrency(stats.sum, currency)})
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadedFile(null);
                    setParseResult(null);
                    setActiveRows([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="rounded-xl font-bold flex-1 sm:flex-none"
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleCommitBulkUpload}
                  disabled={isSubmitting || stats.valid === 0}
                  className="rounded-xl font-bold shadow-lg flex-1 sm:flex-none h-11 px-6 text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting Ledger...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirm & Post {stats.valid} Staff Contributions ({formatCurrency(stats.sum, currency)})
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Step 3: Recent Uploaded Batches Audit History */}
      <Card className="shadow-sm border border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Payroll Source Deduction Batches
              </CardTitle>
              <CardDescription>
                Permanent audit trail of bulk payroll uploads executed by administrators and accountants.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold">
              <Link href="/contributions">
                All Contributions <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="px-6">Batch ID</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Date Uploaded</TableHead>
                <TableHead>Staff Count</TableHead>
                <TableHead className="text-right px-6">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-xs italic">
                    No recent payroll batches uploaded yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentBatches.map((b: any) => (
                  <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs font-bold px-6 text-primary">
                      {b.batchId || b.id}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{b.period || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.createdAt?.seconds 
                        ? format(new Date(b.createdAt.seconds * 1000), 'MMM d, yyyy HH:mm') 
                        : 'Just now'}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {b.totalCount} staff
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs px-6">
                      {formatCurrency(b.totalAmount || 0, currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
