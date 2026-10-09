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
  UserMinus,
} from 'lucide-react';
import {
  exportFinalPayoutsToExcel,
  FinalPayoutExportItem,
  formatRoleLabel,
} from '@/lib/final-payouts-export';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';

interface ExportFinalPayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payouts: FinalPayoutExportItem[];
  currency: string;
  currentUser: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialStatusFilter?: string;
}

export function ExportFinalPayoutsDialog({
  open,
  onOpenChange,
  payouts,
  currency,
  currentUser,
  initialStatusFilter = 'all',
}: ExportFinalPayoutsDialogProps) {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filtered dataset for preview and export
  const filteredPayouts = useMemo(() => {
    return payouts.filter(p => {
      if (statusFilter === 'approved' && p.status !== 'approved') return false;
      if (statusFilter === 'pending' && p.status !== 'pending' && p.status !== 'processing') return false;
      if (statusFilter === 'rejected' && p.status !== 'rejected') return false;
      return true;
    });
  }, [payouts, statusFilter]);

  // Preview metrics
  const totalApproved = useMemo(() => {
    return filteredPayouts
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + (Number(p.totalPayout) || 0), 0);
  }, [filteredPayouts]);

  const totalPending = useMemo(() => {
    return filteredPayouts
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + (Number(p.totalPayout) || 0), 0);
  }, [filteredPayouts]);

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const scopeLabel = statusFilter !== 'all' ? `Final Payouts (${statusFilter.toUpperCase()})` : 'Complete Final Payouts Register';

      const result = exportFinalPayoutsToExcel({
        payouts: filteredPayouts,
        currency,
        statusFilter,
        exportedByName: currentUser.name || 'Authorized Finance Officer',
        exportedByEmail: currentUser.email || '',
        exportedByRole: currentUser.role || 'Administrator',
        scopeLabel,
        includeMetadata,
      });

      toast({
        title: 'Final Payouts Exported',
        description: `Successfully exported ${result.totalExported} payout records to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'Could not generate final payouts spreadsheet.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 bg-card border-border shadow-xl">
        <DialogHeader className="space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserMinus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Export Final Payouts
                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-none text-[9px] font-bold uppercase tracking-wider">
                  Excel .XLSX
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate an official member account closure and final payout settlement register.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* QUICK PREVIEW BANNER */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-2 gap-2 text-center">
            <div className="border-r border-border/50 pr-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Payout Records
              </span>
              <span className="text-base font-extrabold text-foreground">
                {filteredPayouts.length}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                exited member accounts
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Disbursed Settlement
              </span>
              <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalApproved, currency)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                paid to members
              </span>
            </div>
          </div>

          {/* FILTER CRITERIA */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Filter className="h-3 w-3" /> Payout Status
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="all">All Payout Statuses ({payouts.length})</SelectItem>
                <SelectItem value="approved">Approved & Completed Only</SelectItem>
                <SelectItem value="pending">Pending Dual-Control Approval</SelectItem>
                <SelectItem value="rejected">Rejected Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AUDIT NOTICE */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 text-[11px]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>
              Export authorized for <strong>{currentUser.name || 'Officer'}</strong> ({formatRoleLabel(currentUser.role || 'staff')}). Contains official member settlement references.
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
            disabled={isExporting || filteredPayouts.length === 0}
            className="rounded-xl text-xs font-bold gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Excel ({filteredPayouts.length} payouts)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
