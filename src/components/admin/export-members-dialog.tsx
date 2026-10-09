'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSpreadsheet, Download, ShieldCheck, Users, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  MemberExportItem,
  exportMembersToExcel,
  formatRoleLabel,
  formatMemberStatus,
} from '@/lib/members-export';
import { formatCurrency } from '@/lib/currency';

interface ExportMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberExportItem[];
  currency?: string;
  currentUser?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  initialStatusFilter?: string;
  initialRoleFilter?: string;
}

export function ExportMembersDialog({
  open,
  onOpenChange,
  members,
  currency = 'RWF',
  currentUser,
  initialStatusFilter = 'all',
  initialRoleFilter = 'all',
}: ExportMembersDialogProps) {
  const { toast } = useToast();

  const [roleFilter, setRoleFilter] = useState<string>(initialRoleFilter);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [includeRoleSummary, setIncludeRoleSummary] = useState(true);
  const [includeStatusSummary, setIncludeStatusSummary] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Computed preview statistics
  const filteredMembers = members.filter((m) => {
    if (roleFilter !== 'all' && (m.role || 'member').toLowerCase() !== roleFilter.toLowerCase()) {
      return false;
    }
    if (statusFilter !== 'all' && (m.status || 'active').toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  const totalFilteredSavings = filteredMembers.reduce(
    (sum, m) => sum + Number(m.totalSavings || m.savingsBalance || 0),
    0
  );

  const totalFilteredShares = filteredMembers.reduce(
    (sum, m) => sum + Number(m.sharesCount || m.shares || 0),
    0
  );

  const handleExport = () => {
    if (filteredMembers.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Members to Export',
        description: 'No member records match your selected filter criteria.',
      });
      return;
    }

    setIsExporting(true);
    try {
      const scopeLabel = `Members (${statusFilter.toUpperCase()} status, ${roleFilter.toUpperCase()} role)`;

      const result = exportMembersToExcel({
        members,
        currency,
        roleFilter,
        statusFilter,
        exportedByName: currentUser?.name || currentUser?.email || 'Authorized Officer',
        exportedByEmail: currentUser?.email || '',
        exportedByRole: currentUser?.role || 'Administrator',
        scopeLabel,
        includeRoleSummary,
        includeStatusSummary,
        includeMetadata,
      });

      toast({
        title: 'Members Directory Exported!',
        description: `Successfully exported ${result.totalExported} members to ${result.fileName}.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err?.message || 'An error occurred while generating the Excel workbook.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg rounded-2xl bg-card border shadow-2xl p-4 sm:p-6">
        <DialogHeader className="space-y-1.5 border-b pb-4">
          <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground font-headline">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Export Members Directory to Excel
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Generate an institutional multi-sheet Excel workbook (`.xlsx`) of SACCO registered members with savings weight and account profiles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-xs">
          {/* Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/30 rounded-xl border">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3 text-primary" /> Filter by System Role
              </Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 text-xs rounded-xl bg-background">
                  <SelectValue placeholder="All System Roles" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All System Roles</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="senior_accountant">Senior Accountant</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="reviewer">Compliance Reviewer</SelectItem>
                  <SelectItem value="member">General Member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3 text-primary" /> Filter by Account Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs rounded-xl bg-background">
                  <SelectValue placeholder="All Account Statuses" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="all">All Account Statuses</SelectItem>
                  <SelectItem value="active">Active Members Only</SelectItem>
                  <SelectItem value="pending">Pending Verification</SelectItem>
                  <SelectItem value="suspended">Suspended / Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Real-time Export Preview Box */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between font-bold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Ready to Export:
              </span>
              <span className="text-sm font-headline">{filteredMembers.length} Members</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <div>
                <span className="opacity-80">Combined Savings:</span>
                <p className="font-bold text-xs text-foreground">{formatCurrency(totalFilteredSavings, currency)}</p>
              </div>
              <div>
                <span className="opacity-80">Total Shares Owned:</span>
                <p className="font-bold text-xs text-foreground">{totalFilteredShares} Shares</p>
              </div>
            </div>
          </div>

          {/* Worksheet Options Checkboxes */}
          <div className="space-y-2 pt-1">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Worksheet Options &amp; Sheets to Include
            </Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <Checkbox
                  checked={includeRoleSummary}
                  onCheckedChange={(c) => setIncludeRoleSummary(Boolean(c))}
                />
                <span>Include `Role_Distribution` Summary Sheet</span>
              </label>

              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <Checkbox
                  checked={includeStatusSummary}
                  onCheckedChange={(c) => setIncludeStatusSummary(Boolean(c))}
                />
                <span>Include `Status_Breakdown` Summary Sheet</span>
              </label>

              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <Checkbox
                  checked={includeMetadata}
                  onCheckedChange={(c) => setIncludeMetadata(Boolean(c))}
                />
                <span>Include Dual-Control Audit Metadata Sheet</span>
              </label>
            </div>
          </div>

          {/* Audit Banner */}
          <div className="flex items-start gap-2 p-2.5 bg-muted/40 rounded-xl text-[11px] text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>
              Exports are logged for dual-control audit. Data includes member contact info, national IDs, and savings balances. Keep confidential.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || filteredMembers.length === 0}
            className="rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span>Generate Excel ({filteredMembers.length})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
