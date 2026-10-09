'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileSpreadsheet,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Users,
  Calendar,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import {
  exportContributionsToExcel,
  ContributionExportItem,
  BatchExportItem,
  formatRoleLabel,
} from '@/lib/contributions-export';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';

interface ExportContributionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allSlips: ContributionExportItem[];
  allBatches?: BatchExportItem[];
  memberMap: Map<string, any>;
  currency: string;
  currentUser: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialStatusFilter?: string;
  initialSearchQuery?: string;
}

export function ExportContributionsDialog({
  open,
  onOpenChange,
  allSlips,
  allBatches = [],
  memberMap,
  currency,
  currentUser,
  initialStatusFilter = 'all',
  initialSearchQuery = '',
}: ExportContributionsDialogProps) {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [includeMemberSummary, setIncludeMemberSummary] = useState(true);
  const [includePeriodSummary, setIncludePeriodSummary] = useState(true);
  const [includeBatches, setIncludeBatches] = useState(allBatches.length > 0);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Extract distinct periods
  const distinctPeriods = useMemo(() => {
    const set = new Set<string>();
    allSlips.forEach(s => {
      if (s.period && s.period.trim()) {
        set.add(s.period.trim());
      }
    });
    return Array.from(set).sort();
  }, [allSlips]);

  // Extract distinct members who have contributions
  const contributingMembers = useMemo(() => {
    const memberIds = new Set<string>();
    allSlips.forEach(s => {
      if (s.memberId) memberIds.add(s.memberId);
    });
    return Array.from(memberIds).map(id => {
      const m = memberMap.get(id);
      return {
        id,
        name: m?.name || m?.displayName || id,
        email: m?.email || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSlips, memberMap]);

  // Filtered dataset for preview and export
  const filteredSlips = useMemo(() => {
    return allSlips.filter(slip => {
      // Status filter
      if (statusFilter === 'approved') {
        if (slip.status !== 'approved' && slip.status !== 'verified') return false;
      } else if (statusFilter === 'pending') {
        if (
          slip.status === 'approved' ||
          slip.status === 'verified' ||
          slip.status === 'rejected' ||
          slip.status === 'reversed'
        ) {
          return false;
        }
      } else if (statusFilter === 'rejected') {
        if (slip.status !== 'rejected') return false;
      }

      // Period filter
      if (periodFilter !== 'all' && slip.period?.trim() !== periodFilter) {
        return false;
      }

      // Member filter
      if (memberFilter !== 'all' && slip.memberId !== memberFilter) {
        return false;
      }

      return true;
    });
  }, [allSlips, statusFilter, periodFilter, memberFilter]);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    if (!includeBatches) return [];
    return allBatches.filter(batch => {
      if (statusFilter === 'approved' && batch.status !== 'approved') return false;
      if (statusFilter === 'pending' && batch.status === 'approved') return false;
      if (periodFilter !== 'all' && batch.defaultPeriod?.trim() !== periodFilter) return false;
      return true;
    });
  }, [allBatches, includeBatches, statusFilter, periodFilter]);

  // KPI preview
  const totalAmount = useMemo(() => {
    return filteredSlips.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [filteredSlips]);

  const approvedCount = useMemo(() => {
    return filteredSlips.filter(s => s.status === 'approved' || s.status === 'verified').length;
  }, [filteredSlips]);

  const pendingCount = useMemo(() => {
    return filteredSlips.filter(
      s => s.status !== 'approved' && s.status !== 'verified' && s.status !== 'rejected' && s.status !== 'reversed'
    ).length;
  }, [filteredSlips]);

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const scopeParts = [];
      if (statusFilter !== 'all') scopeParts.push(statusFilter.toUpperCase());
      if (periodFilter !== 'all') scopeParts.push(periodFilter);
      if (memberFilter !== 'all') {
        const m = memberMap.get(memberFilter);
        scopeParts.push(m?.name || 'Member');
      }
      const scopeLabel = scopeParts.length > 0 ? scopeParts.join(' - ') : 'Complete Ledger';

      const result = exportContributionsToExcel({
        slips: filteredSlips,
        batches: filteredBatches,
        memberMap,
        currency,
        exportedByName: currentUser.name || 'Authorized Officer',
        exportedByEmail: currentUser.email || '',
        exportedByRole: currentUser.role || 'Administrator',
        scopeLabel,
        includeMemberSummary,
        includePeriodSummary,
        includeBatches: includeBatches && filteredBatches.length > 0,
        includeMetadata,
      });

      toast({
        title: 'Excel Report Downloaded',
        description: `Successfully exported ${result.totalExported} contribution records to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not generate Excel spreadsheet.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl p-6 bg-card border-border shadow-xl">
        <DialogHeader className="space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Export Members' Contributions
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-none text-[9px] font-bold uppercase tracking-wider">
                  Excel .XLSX
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate an institutional-grade multi-sheet workbook with dual-control audit trails, member summaries, and period breakdowns.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* QUICK PREVIEW BANNER */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-3 gap-2 text-center">
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Records
              </span>
              <span className="text-base font-extrabold text-foreground">
                {filteredSlips.length}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                ({approvedCount} approved, {pendingCount} pending)
              </span>
            </div>
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Volume
              </span>
              <span className="text-base font-extrabold text-primary">
                {formatCurrency(totalAmount, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                in {currency}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Batches Included
              </span>
              <span className="text-base font-extrabold text-foreground">
                {includeBatches ? filteredBatches.length : 0}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                payroll uploads
              </span>
            </div>
          </div>

          {/* FILTER CRITERIA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3" /> Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Statuses ({allSlips.length})</SelectItem>
                  <SelectItem value="approved">Approved & Verified Only</SelectItem>
                  <SelectItem value="pending">Pending Review / Approval</SelectItem>
                  <SelectItem value="rejected">Rejected Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Period Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Period
              </Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Periods" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Periods</SelectItem>
                  {distinctPeriods.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Member Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Users className="h-3 w-3" /> Member
              </Label>
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Members" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs max-h-56">
                  <SelectItem value="all">All Members ({contributingMembers.length})</SelectItem>
                  {contributingMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* WORKBOOK SHEETS OPTIONS */}
          <div className="space-y-2 pt-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3 w-3" /> Include Sheets in Workbook
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-muted/20 p-3 rounded-xl border border-border/50">
              <div className="flex items-center space-x-2">
                <Checkbox id="sheet-ledger" checked disabled />
                <label htmlFor="sheet-ledger" className="text-xs font-semibold leading-none cursor-pointer">
                  1. Contributions Ledger <span className="text-muted-foreground text-[10px]">(All transaction rows)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-member-summary"
                  checked={includeMemberSummary}
                  onCheckedChange={v => setIncludeMemberSummary(Boolean(v))}
                />
                <label htmlFor="sheet-member-summary" className="text-xs font-semibold leading-none cursor-pointer">
                  2. Member Summary <span className="text-muted-foreground text-[10px]">(Totals per member)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-period-summary"
                  checked={includePeriodSummary}
                  onCheckedChange={v => setIncludePeriodSummary(Boolean(v))}
                />
                <label htmlFor="sheet-period-summary" className="text-xs font-semibold leading-none cursor-pointer">
                  3. Period Breakdown <span className="text-muted-foreground text-[10px]">(Totals per payroll cycle)</span>
                </label>
              </div>

              {allBatches.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sheet-batches"
                    checked={includeBatches}
                    onCheckedChange={v => setIncludeBatches(Boolean(v))}
                  />
                  <label htmlFor="sheet-batches" className="text-xs font-semibold leading-none cursor-pointer">
                    4. Batches Ledger <span className="text-muted-foreground text-[10px]">(Bulk deduction uploads)</span>
                  </label>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-metadata"
                  checked={includeMetadata}
                  onCheckedChange={v => setIncludeMetadata(Boolean(v))}
                />
                <label htmlFor="sheet-metadata" className="text-xs font-semibold leading-none cursor-pointer">
                  {allBatches.length > 0 ? '5' : '4'}. Report & Audit Overview <span className="text-muted-foreground text-[10px]">(Compliance record)</span>
                </label>
              </div>
            </div>
          </div>

          {/* AUDIT NOTICE */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 text-[11px]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>
              Export authorized for <strong>{currentUser.name || 'Officer'}</strong> ({formatRoleLabel(currentUser.role || 'staff')}). The generated document contains cryptographic ledger IDs for external audit reconciliation.
            </span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={isExporting || filteredSlips.length === 0}
            className="rounded-xl text-xs font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Excel ({filteredSlips.length} rows)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
