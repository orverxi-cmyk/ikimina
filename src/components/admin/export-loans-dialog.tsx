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
  Landmark,
} from 'lucide-react';
import {
  exportLoansToExcel,
  LoanExportItem,
  RepaymentExportItem,
  formatRoleLabel,
} from '@/lib/loans-export';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';

interface ExportLoansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allLoans: LoanExportItem[];
  allRepayments?: RepaymentExportItem[];
  memberMap: Map<string, any>;
  currency: string;
  liquidityMetrics?: any;
  currentUser: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialStatusFilter?: string;
}

export function ExportLoansDialog({
  open,
  onOpenChange,
  allLoans,
  allRepayments = [],
  memberMap,
  currency,
  liquidityMetrics,
  currentUser,
  initialStatusFilter = 'all',
}: ExportLoansDialogProps) {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [borrowerFilter, setBorrowerFilter] = useState<string>('all');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<string>('all');
  const [includeRepayments, setIncludeRepayments] = useState(allRepayments.length > 0);
  const [includeBorrowerSummary, setIncludeBorrowerSummary] = useState(true);
  const [includePortfolioKPIs, setIncludePortfolioKPIs] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Extract distinct borrowers who have loans
  const distinctBorrowers = useMemo(() => {
    const memberIds = new Set<string>();
    allLoans.forEach(l => {
      if (l.memberId) memberIds.add(l.memberId);
    });
    return Array.from(memberIds).map(id => {
      const m = memberMap.get(id);
      return {
        id,
        name: m?.name || m?.displayName || id,
        email: m?.email || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [allLoans, memberMap]);

  // Filtered dataset for preview and export
  const filteredLoans = useMemo(() => {
    return allLoans.filter(loan => {
      // Status filter
      if (statusFilter === 'active') {
        if (loan.status !== 'approved' && loan.status !== 'active') return false;
      } else if (statusFilter === 'completed') {
        if (loan.status !== 'completed') return false;
      } else if (statusFilter === 'pending') {
        if (
          loan.status === 'approved' ||
          loan.status === 'active' ||
          loan.status === 'completed' ||
          loan.status === 'rejected' ||
          loan.status === 'withdrawn'
        ) {
          return false;
        }
      } else if (statusFilter === 'rejected') {
        if (loan.status !== 'rejected') return false;
      }

      // Borrower filter
      if (borrowerFilter !== 'all' && loan.memberId !== borrowerFilter) {
        return false;
      }

      // Facility Type filter
      if (facilityTypeFilter === 'standard' && loan.isTopUp) {
        return false;
      }
      if (facilityTypeFilter === 'topup' && !loan.isTopUp) {
        return false;
      }

      return true;
    });
  }, [allLoans, statusFilter, borrowerFilter, facilityTypeFilter]);

  // Filtered repayments matching the filtered loans
  const filteredRepayments = useMemo(() => {
    if (!includeRepayments) return [];
    const loanIds = new Set(filteredLoans.map(l => l.id));
    return allRepayments.filter(r => (r.loanId ? loanIds.has(r.loanId) : true));
  }, [allRepayments, filteredLoans, includeRepayments]);

  // Financial preview metrics
  const totalPrincipal = useMemo(() => {
    return filteredLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }, [filteredLoans]);

  const totalOutstanding = useMemo(() => {
    return filteredLoans
      .filter(l => l.status === 'approved' || l.status === 'active')
      .reduce((sum, l) => sum + (Number(l.balance) || 0), 0);
  }, [filteredLoans]);

  const activeCount = useMemo(() => {
    return filteredLoans.filter(l => l.status === 'approved' || l.status === 'active').length;
  }, [filteredLoans]);

  const completedCount = useMemo(() => {
    return filteredLoans.filter(l => l.status === 'completed').length;
  }, [filteredLoans]);

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const scopeParts = [];
      if (statusFilter !== 'all') scopeParts.push(statusFilter.toUpperCase());
      if (facilityTypeFilter !== 'all') scopeParts.push(facilityTypeFilter === 'topup' ? 'Top-Ups' : 'Standard');
      if (borrowerFilter !== 'all') {
        const m = memberMap.get(borrowerFilter);
        scopeParts.push(m?.name || 'Borrower');
      }
      const scopeLabel = scopeParts.length > 0 ? scopeParts.join(' - ') : 'Complete Portfolio';

      const result = exportLoansToExcel({
        loans: filteredLoans,
        repayments: filteredRepayments,
        memberMap,
        currency,
        liquidityMetrics,
        exportedByName: currentUser.name || 'Authorized Credit Officer',
        exportedByEmail: currentUser.email || '',
        exportedByRole: currentUser.role || 'Administrator',
        scopeLabel,
        includeRepayments: includeRepayments && filteredRepayments.length > 0,
        includeBorrowerSummary,
        includePortfolioKPIs,
        includeMetadata,
      });

      toast({
        title: 'Loan Portfolio Exported',
        description: `Successfully exported ${result.totalExported} credit facilities to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not generate loan portfolio spreadsheet.',
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
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Export Loan Portfolio
                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-none text-[9px] font-bold uppercase tracking-wider">
                  Excel .XLSX
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate an institutional credit facilities register with repayments, borrower exposure, and liquidity risk gauges.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* QUICK PREVIEW BANNER */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-3 gap-2 text-center">
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Facilities
              </span>
              <span className="text-base font-extrabold text-foreground">
                {filteredLoans.length}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                ({activeCount} active, {completedCount} repaid)
              </span>
            </div>
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Disbursed Principal
              </span>
              <span className="text-base font-extrabold text-primary">
                {formatCurrency(totalPrincipal, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                cumulative principal
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Active Debt Balance
              </span>
              <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                {formatCurrency(totalOutstanding, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                outstanding exposure
              </span>
            </div>
          </div>

          {/* FILTER CRITERIA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3" /> Facility Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Facilities ({allLoans.length})</SelectItem>
                  <SelectItem value="active">Active / Disbursed Only</SelectItem>
                  <SelectItem value="completed">Completed (Fully Repaid)</SelectItem>
                  <SelectItem value="pending">Under Review / Pending</SelectItem>
                  <SelectItem value="rejected">Rejected Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Borrower Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Users className="h-3 w-3" /> Borrower
              </Label>
              <Select value={borrowerFilter} onValueChange={setBorrowerFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Borrowers" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs max-h-56">
                  <SelectItem value="all">All Borrowers ({distinctBorrowers.length})</SelectItem>
                  {distinctBorrowers.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Facility Type */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Layers className="h-3 w-3" /> Facility Type
              </Label>
              <Select value={facilityTypeFilter} onValueChange={setFacilityTypeFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Facility Types</SelectItem>
                  <SelectItem value="standard">Standard Capital Loans</SelectItem>
                  <SelectItem value="topup">Loan Top-Ups</SelectItem>
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
                <Checkbox id="sheet-loans" checked disabled />
                <label htmlFor="sheet-loans" className="text-xs font-semibold leading-none cursor-pointer">
                  1. Loan Portfolio <span className="text-muted-foreground text-[10px]">(All facilities ledger)</span>
                </label>
              </div>

              {allRepayments.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sheet-repayments"
                    checked={includeRepayments}
                    onCheckedChange={v => setIncludeRepayments(Boolean(v))}
                  />
                  <label htmlFor="sheet-repayments" className="text-xs font-semibold leading-none cursor-pointer">
                    2. Repayments Ledger <span className="text-muted-foreground text-[10px]">(Installments history)</span>
                  </label>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-borrower-summary"
                  checked={includeBorrowerSummary}
                  onCheckedChange={v => setIncludeBorrowerSummary(Boolean(v))}
                />
                <label htmlFor="sheet-borrower-summary" className="text-xs font-semibold leading-none cursor-pointer">
                  3. Borrower Exposure <span className="text-muted-foreground text-[10px]">(Totals per member)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-risk-kpis"
                  checked={includePortfolioKPIs}
                  onCheckedChange={v => setIncludePortfolioKPIs(Boolean(v))}
                />
                <label htmlFor="sheet-risk-kpis" className="text-xs font-semibold leading-none cursor-pointer">
                  4. Portfolio Risk & KPIs <span className="text-muted-foreground text-[10px]">(Lending pool ceiling)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-loan-meta"
                  checked={includeMetadata}
                  onCheckedChange={v => setIncludeMetadata(Boolean(v))}
                />
                <label htmlFor="sheet-loan-meta" className="text-xs font-semibold leading-none cursor-pointer">
                  5. Credit Governance <span className="text-muted-foreground text-[10px]">(Compliance record)</span>
                </label>
              </div>
            </div>
          </div>

          {/* AUDIT NOTICE */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 text-[11px]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>
              Export authorized for <strong>{currentUser.name || 'Officer'}</strong> ({formatRoleLabel(currentUser.role || 'staff')}). The generated report contains authoritative facility numbers and audit justifications.
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
            disabled={isExporting || filteredLoans.length === 0}
            className="rounded-xl text-xs font-bold gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Excel ({filteredLoans.length} facilities)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
