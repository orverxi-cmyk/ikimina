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
  Layers,
  Users,
  ShieldCheck,
  Loader2,
  Coins,
  Calendar,
} from 'lucide-react';
import {
  exportInterestToExcel,
  InterestRunItem,
  InterestProposalItem,
  formatRoleLabel,
} from '@/lib/interest-export';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ExportInterestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: InterestRunItem[];
  proposals?: InterestProposalItem[];
  memberMap: Map<string, any>;
  currency: string;
  poolMetrics?: any;
  currentUser: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialRunId?: string;
}

export function ExportInterestDialog({
  open,
  onOpenChange,
  runs,
  proposals = [],
  memberMap,
  currency,
  poolMetrics,
  currentUser,
  initialRunId = 'all',
}: ExportInterestDialogProps) {
  const { toast } = useToast();

  const [selectedRunId, setSelectedRunId] = useState<string>(initialRunId);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [includeAllocationsDetail, setIncludeAllocationsDetail] = useState(true);
  const [includeMemberSummary, setIncludeMemberSummary] = useState(true);
  const [includeProposals, setIncludeProposals] = useState(proposals.length > 0);
  const [includePoolKPIs, setIncludePoolKPIs] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Distinct members from all runs
  const participatingMembers = useMemo(() => {
    const memberIds = new Set<string>();
    runs.forEach(r => {
      if (Array.isArray(r.breakdown)) {
        r.breakdown.forEach((item: any) => {
          if (item.memberId) memberIds.add(item.memberId);
        });
      }
    });
    return Array.from(memberIds).map(id => {
      const m = memberMap.get(id);
      return {
        id,
        name: m?.name || m?.displayName || id,
        email: m?.email || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [runs, memberMap]);

  // Target runs
  const targetRuns = useMemo(() => {
    return selectedRunId === 'all'
      ? runs
      : runs.filter(r => r.id === selectedRunId);
  }, [runs, selectedRunId]);

  // Real-time calculation of preview metrics
  const previewMetrics = useMemo(() => {
    let totalDividends = 0;
    let matchingAllocations = 0;

    targetRuns.forEach(r => {
      const breakdown = Array.isArray(r.breakdown) ? r.breakdown : [];
      breakdown.forEach((item: any) => {
        const mid = item.memberId;
        const pref = item.payoutPreference || item.preference || (item.payoutAmount > 0 ? 'receive_payout' : 'add_to_contribution');

        if (memberFilter !== 'all' && mid !== memberFilter) return;
        if (channelFilter === 'capitalized' && pref !== 'add_to_contribution') return;
        if (channelFilter === 'cash' && pref !== 'receive_payout') return;

        const amt = Number(item.allocatedAmount ?? item.amount ?? item.dividend) || 0;
        totalDividends += amt;
        matchingAllocations += 1;
      });
    });

    return {
      totalDividends,
      matchingAllocations,
    };
  }, [targetRuns, memberFilter, channelFilter]);

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const scopeParts = [];
      if (selectedRunId !== 'all') {
        const r = runs.find(run => run.id === selectedRunId);
        scopeParts.push(`Run_${r?.id ? r.id.slice(0, 8) : 'Single'}`);
      }
      if (channelFilter !== 'all') {
        scopeParts.push(channelFilter === 'cash' ? 'Cash_Payouts' : 'Reinvested_Savings');
      }
      if (memberFilter !== 'all') {
        const m = memberMap.get(memberFilter);
        scopeParts.push(m?.name || 'Member');
      }
      const scopeLabel = scopeParts.length > 0 ? scopeParts.join(' - ') : 'Complete Interest Register';

      const result = exportInterestToExcel({
        runs: targetRuns,
        proposals,
        memberMap,
        currency,
        poolMetrics,
        selectedRunId,
        channelFilter,
        memberFilter,
        exportedByName: currentUser.name || 'Authorized Finance Officer',
        exportedByEmail: currentUser.email || '',
        exportedByRole: currentUser.role || 'Administrator',
        scopeLabel,
        includeAllocationsDetail,
        includeMemberSummary,
        includeProposals: includeProposals && proposals.length > 0,
        includePoolKPIs,
        includeMetadata,
      });

      toast({
        title: 'Interest Distribution Exported',
        description: `Successfully exported ${result.totalRunsExported} runs and ${result.totalAllocationsExported} allocations to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not generate interest distribution spreadsheet.',
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
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Export Interest Distribution
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-none text-[9px] font-bold uppercase tracking-wider">
                  Excel .XLSX
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate an official institutional dividend allocation ledger with member-level pro-rata breakdowns and profit pool metrics.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* QUICK PREVIEW BANNER */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-3 gap-2 text-center">
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Distribution Runs
              </span>
              <span className="text-base font-extrabold text-foreground">
                {targetRuns.length}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {selectedRunId === 'all' ? 'All historical cycles' : 'Selected single run'}
              </span>
            </div>
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Matching Allocations
              </span>
              <span className="text-base font-extrabold text-foreground">
                {previewMetrics.matchingAllocations}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                member payouts
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Dividend Sum
              </span>
              <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                {formatCurrency(previewMetrics.totalDividends, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                allocated profit
              </span>
            </div>
          </div>

          {/* FILTER CRITERIA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Target Run Picker */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Distribution Cycle
              </Label>
              <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Runs" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs max-h-56">
                  <SelectItem value="all">All Historical Runs ({runs.length})</SelectItem>
                  {runs.map(r => {
                    const dStr = r.distributedAt ? format(new Date(r.distributedAt?.seconds ? r.distributedAt.seconds * 1000 : r.distributedAt), 'MMM d, yyyy') : r.id.slice(0, 8);
                    const amtStr = formatCurrency(Number(r.amountDistributed || r.totalDistributed) || 0, currency);
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        {dStr} &bull; {amtStr}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Payout Channel Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3" /> Payout Channel
              </Label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Payout Channels</SelectItem>
                  <SelectItem value="capitalized">Reinvested to Savings</SelectItem>
                  <SelectItem value="cash">Liquid Cash Payouts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Member Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Users className="h-3 w-3" /> Recipient Member
              </Label>
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Members" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs max-h-56">
                  <SelectItem value="all">All Recipients ({participatingMembers.length})</SelectItem>
                  {participatingMembers.map(m => (
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
                <Checkbox id="sheet-historical-runs" checked disabled />
                <label htmlFor="sheet-historical-runs" className="text-xs font-semibold leading-none cursor-pointer">
                  1. Historical Runs <span className="text-muted-foreground text-[10px]">(Cycle summaries)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-allocations-detail"
                  checked={includeAllocationsDetail}
                  onCheckedChange={v => setIncludeAllocationsDetail(Boolean(v))}
                />
                <label htmlFor="sheet-allocations-detail" className="text-xs font-semibold leading-none cursor-pointer">
                  2. Allocations Detail <span className="text-muted-foreground text-[10px]">(Member breakdown)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-member-summary"
                  checked={includeMemberSummary}
                  onCheckedChange={v => setIncludeMemberSummary(Boolean(v))}
                />
                <label htmlFor="sheet-member-summary" className="text-xs font-semibold leading-none cursor-pointer">
                  3. Member Lifetime Totals <span className="text-muted-foreground text-[10px]">(Cumulative dividends)</span>
                </label>
              </div>

              {proposals.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sheet-proposals"
                    checked={includeProposals}
                    onCheckedChange={v => setIncludeProposals(Boolean(v))}
                  />
                  <label htmlFor="sheet-proposals" className="text-xs font-semibold leading-none cursor-pointer">
                    4. Proposals Queue <span className="text-muted-foreground text-[10px]">(Approval audit trail)</span>
                  </label>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-pool-kpis"
                  checked={includePoolKPIs}
                  onCheckedChange={v => setIncludePoolKPIs(Boolean(v))}
                />
                <label htmlFor="sheet-pool-kpis" className="text-xs font-semibold leading-none cursor-pointer">
                  {proposals.length > 0 ? '5' : '4'}. Profit Pool & Metrics <span className="text-muted-foreground text-[10px]">(Realized profit gauges)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-meta"
                  checked={includeMetadata}
                  onCheckedChange={v => setIncludeMetadata(Boolean(v))}
                />
                <label htmlFor="sheet-meta" className="text-xs font-semibold leading-none cursor-pointer">
                  {proposals.length > 0 ? '6' : '5'}. Dual-Control Sign-Off <span className="text-muted-foreground text-[10px]">(Compliance record)</span>
                </label>
              </div>
            </div>
          </div>

          {/* AUDIT NOTICE */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-[11px]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Export authorized for <strong>{currentUser.name || 'Officer'}</strong> ({formatRoleLabel(currentUser.role || 'staff')}). Dividends and pro-rata ratios reflect authoritative cryptographic snapshots.
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
            disabled={isExporting || targetRuns.length === 0}
            className="rounded-xl text-xs font-bold gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Excel ({targetRuns.length} runs)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
