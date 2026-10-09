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
  ShieldCheck,
  Loader2,
  Receipt,
  Building2,
} from 'lucide-react';
import {
  exportExpensesToExcel,
  ExpenseExportItem,
  formatRoleLabel,
} from '@/lib/expenses-export';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';

interface ExportExpensesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: ExpenseExportItem[];
  categories: string[];
  currency: string;
  currentUser: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialStatusFilter?: string;
}

export function ExportExpensesDialog({
  open,
  onOpenChange,
  expenses,
  categories,
  currency,
  currentUser,
  initialStatusFilter = 'all',
}: ExportExpensesDialogProps) {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [includeCategorySummary, setIncludeCategorySummary] = useState(true);
  const [includeStatusBreakdown, setIncludeStatusBreakdown] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filtered dataset for preview and export
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (categoryFilter !== 'all' && exp.category !== categoryFilter) return false;
      if (statusFilter === 'approved' && exp.status !== 'approved') return false;
      if (statusFilter === 'pending' && exp.status === 'approved') return false;
      if (statusFilter === 'rejected' && exp.status !== 'rejected') return false;
      return true;
    });
  }, [expenses, categoryFilter, statusFilter]);

  // Preview metrics
  const totalApproved = useMemo(() => {
    return filteredExpenses
      .filter(e => e.status === 'approved')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  const totalPending = useMemo(() => {
    return filteredExpenses
      .filter(e => e.status !== 'approved' && e.status !== 'rejected')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const scopeParts = [];
      if (statusFilter !== 'all') scopeParts.push(statusFilter.toUpperCase());
      if (categoryFilter !== 'all') scopeParts.push(categoryFilter);
      const scopeLabel = scopeParts.length > 0 ? scopeParts.join(' - ') : 'Complete Operating Expenses';

      const result = exportExpensesToExcel({
        expenses: filteredExpenses,
        currency,
        categoryFilter,
        statusFilter,
        exportedByName: currentUser.name || 'Authorized Finance Officer',
        exportedByEmail: currentUser.email || '',
        exportedByRole: currentUser.role || 'Administrator',
        scopeLabel,
        includeCategorySummary,
        includeStatusBreakdown,
        includeMetadata,
      });

      toast({
        title: 'Operating Expenses Exported',
        description: `Successfully exported ${result.totalExported} expense items to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not generate expenses spreadsheet.',
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
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Export Operating Expenses
                <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-none text-[9px] font-bold uppercase tracking-wider">
                  Excel .XLSX
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate an official institutional operating expenditure register with category summaries and receipt links.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* QUICK PREVIEW BANNER */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-3 gap-2 text-center">
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Expenses
              </span>
              <span className="text-base font-extrabold text-foreground">
                {filteredExpenses.length}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                records matching filter
              </span>
            </div>
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Approved Expenditure
              </span>
              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalApproved, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                ratified volume
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Pending Audit Volume
              </span>
              <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                {formatCurrency(totalPending, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                in review pipeline
              </span>
            </div>
          </div>

          {/* FILTER CRITERIA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <SelectItem value="all">All Statuses ({expenses.length})</SelectItem>
                  <SelectItem value="approved">Approved & Ratified Only</SelectItem>
                  <SelectItem value="pending">Pending Dual-Control Review</SelectItem>
                  <SelectItem value="rejected">Rejected Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Category
              </Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs max-h-56">
                  <SelectItem value="all">All Expense Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>
                      {c}
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
                <Checkbox id="sheet-exp-ledger" checked disabled />
                <label htmlFor="sheet-exp-ledger" className="text-xs font-semibold leading-none cursor-pointer">
                  1. Expenses Ledger <span className="text-muted-foreground text-[10px]">(All transaction rows)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-exp-cat"
                  checked={includeCategorySummary}
                  onCheckedChange={v => setIncludeCategorySummary(Boolean(v))}
                />
                <label htmlFor="sheet-exp-cat" className="text-xs font-semibold leading-none cursor-pointer">
                  2. Category Summary <span className="text-muted-foreground text-[10px]">(Totals per category)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-exp-status"
                  checked={includeStatusBreakdown}
                  onCheckedChange={v => setIncludeStatusBreakdown(Boolean(v))}
                />
                <label htmlFor="sheet-exp-status" className="text-xs font-semibold leading-none cursor-pointer">
                  3. Status Breakdown <span className="text-muted-foreground text-[10px]">(Approved vs pending)</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sheet-exp-meta"
                  checked={includeMetadata}
                  onCheckedChange={v => setIncludeMetadata(Boolean(v))}
                />
                <label htmlFor="sheet-exp-meta" className="text-xs font-semibold leading-none cursor-pointer">
                  4. Report & Audit Overview <span className="text-muted-foreground text-[10px]">(Governance statement)</span>
                </label>
              </div>
            </div>
          </div>

          {/* AUDIT NOTICE */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-900 dark:text-violet-300 text-[11px]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              Export authorized for <strong>{currentUser.name || 'Officer'}</strong> ({formatRoleLabel(currentUser.role || 'staff')}). Contains official receipt links and dual-control audit notes.
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
            disabled={isExporting || filteredExpenses.length === 0}
            className="rounded-xl text-xs font-bold gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Excel ({filteredExpenses.length} items)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
