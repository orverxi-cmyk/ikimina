'use client';

import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, UserPlus, Loader2, ShieldAlert, Download, Calendar as CalendarIcon, Upload, AlertCircle, FileSpreadsheet, UserX, Trash2, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { 
  registerMemberAction, 
  bulkRegisterMembersAction, 
  updateUserRoleAction,
  updateMemberProfileAction,
  deleteMemberAction,
  sendMemberActivationEmailAction
} from '@/lib/finance-client';
import { parseAppError, isBrowserOffline } from '@/lib/error-handler';

export default function MembersPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Super Admin Direct Deletion Dialog States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<any>(null);
  const [deleteJustification, setDeleteJustification] = useState('');
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  const isAdmin = userData?.role === 'admin';

  const membersQuery = useMemoFirebase(() => {
    if (!isAdmin) return null;
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
  }, [isAdmin]);

  const { data: membersSnap, loading: membersLoading } = useCollection(membersQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);

  const filteredMembers = useMemo(() => members.filter((m: any) => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone?.includes(searchTerm)
  ), [members, searchTerm]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before updating member access.",
      });
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    
    const memberData = {
      firstName: formData.get('firstName') as string,
      surname: formData.get('surname') as string,
      email: (formData.get('email') as string).toLowerCase(),
      phone: formData.get('phone') as string,
      role: formData.get('role') as string,
      justification: formData.get('justification') as string,
    };

    try {
      if (isEditing && selectedMember) {
        if (memberData.role !== selectedMember.role) {
          await updateUserRoleAction(selectedMember.id, memberData.role, memberData.justification);
        }

        await updateMemberProfileAction(selectedMember.id, {
          name: `${memberData.firstName} ${memberData.surname}`.trim(),
          phone: memberData.phone,
        });
        
        toast({ title: "Profile Updated", description: "Member profile and role synchronization complete." });
      } else {
        const res = await registerMemberAction(user.uid, memberData);
        toast({ 
          title: "Member Enrolled", 
          description: res?.emailSent 
            ? `Member profile registered and activation email dispatched to ${memberData.email}.`
            : `Member profile registered. Activation link generated successfully.`
        });
      }
      setIsAddDialogOpen(false);
      setIsEditing(false);
      setSelectedMember(null);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Operation Failed", description: parsed.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendActivation = async (targetMember: any) => {
    if (isBrowserOffline()) {
      return toast({
        variant: 'destructive',
        title: 'Connection Offline',
        description: 'You are currently offline. Please reconnect before sending emails.',
      });
    }

    try {
      const res = await sendMemberActivationEmailAction({
        email: targetMember.email,
        memberId: targetMember.id,
        appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      toast({
        title: res.emailSent ? "Activation Email Dispatched" : "Activation Link Generated",
        description: res.emailSent 
          ? `A secure activation link was dispatched to ${targetMember.email}.`
          : `Activation link generated: ${res.message}`,
      });
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({ 
        variant: "destructive", 
        title: parsed.title || "Dispatch Failed", 
        description: parsed.message 
      });
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ['name', 'email', 'phone', 'role'];
    const sampleData = ['Jean Mugisha', 'jean@example.com', '250780000000', 'member'];
    const csvContent = [headers.join(','), sampleData.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'ikimina_member_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !fileInputRef.current?.files?.[0]) return;
    
    if (isBrowserOffline()) {
      toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently disconnected from the internet. Please connect before uploading enrollment files.",
      });
      return;
    }

    setIsSubmitting(true);
    const file = fileInputRef.current.files[0];
    const formData = new FormData(e.currentTarget);
    const justification = formData.get('justification') as string;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const rows = text.split('\n').filter(r => r.trim() !== '');
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        
        const data = rows.slice(1).map(row => {
          const values = row.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index];
          });
          return obj;
        });

        try {
          await bulkRegisterMembersAction(user.uid, data, justification);
          toast({ title: "Success", description: `${data.length} members processed for system enrollment.` });
          setIsBulkDialogOpen(false);
        } catch (innerError: any) {
          const parsed = parseAppError(innerError);
          toast({ variant: "destructive", title: parsed.title || "Bulk Upload Failed", description: parsed.message });
        } finally {
          setIsSubmitting(false);
        }
      };
      reader.readAsText(file);
    } catch (error: any) {
      const parsed = parseAppError(error);
      toast({ variant: "destructive", title: parsed.title || "Bulk Upload Failed", description: parsed.message });
      setIsSubmitting(false);
    }
  };

  const splitName = (fullName: string = '') => {
    const parts = fullName.split(' ');
    return {
      firstName: parts[0] || '',
      surname: parts.slice(1).join(' ') || ''
    };
  };

  const handleDeleteMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberToDelete || !deleteJustification.trim()) return;

    if (isBrowserOffline()) {
      return toast({
        variant: "destructive",
        title: "Connection Offline",
        description: "You are currently offline. Please connect before deleting accounts.",
      });
    }

    setIsDeletingMember(true);
    try {
      await deleteMemberAction(memberToDelete.id, deleteJustification.trim());
      toast({
        title: "Account Permanently Deleted",
        description: `Account for ${memberToDelete.name || memberToDelete.email} has been deleted directly by Super Admin.`,
      });
      setIsDeleteDialogOpen(false);
      setMemberToDelete(null);
      setDeleteJustification('');
    } catch (err: any) {
      const parsed = parseAppError(err);
      toast({
        variant: "destructive",
        title: parsed.title || "Deletion Failed",
        description: parsed.message,
      });
    } finally {
      setIsDeletingMember(false);
    }
  };

  if (userLoading || (isAdmin && membersLoading)) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can manage system roles.</p>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[13px] font-bold font-headline text-foreground">Member Directory</h1>
          <p className="text-[12px] font-bold text-muted-foreground">Assign roles and manage participant access</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
           <Button variant="outline" onClick={() => setIsBulkDialogOpen(true)} className="rounded-xl border-primary/20 text-primary font-bold text-[12px] h-10 flex-1 sm:flex-none">
             <Upload className="mr-2 h-4 w-4" /> Bulk Enrollment
           </Button>
           <Button onClick={() => { setIsEditing(false); setSelectedMember(null); setIsAddDialogOpen(true); }} className="rounded-xl shadow-sm font-bold text-[12px] h-10 flex-1 sm:flex-none">
             <UserPlus className="mr-2 h-4 w-4" /> Add Member
           </Button>
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Access & Profile' : 'Register New Member'}</DialogTitle>
              <DialogDescription>Assign the appropriate system role and verification context.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">First Name</Label>
                  <Input name="firstName" defaultValue={selectedMember ? splitName(selectedMember.name).firstName : ''} required className="h-11 rounded-xl bg-muted border-none" />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider">Surname</Label>
                  <Input name="surname" defaultValue={selectedMember ? splitName(selectedMember.name).surname : ''} required className="h-11 rounded-xl bg-muted border-none" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Email Address</Label>
                <Input name="email" type="email" defaultValue={selectedMember?.email} required disabled={isEditing} className="h-11 rounded-xl bg-muted border-none" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider">System Access Role</Label>
                <Select name="role" defaultValue={selectedMember?.role || 'member'}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted border-none">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator (Full Control)</SelectItem>
                    <SelectItem value="auditor">Auditor (Full Audit Trail &amp; PDF Reports)</SelectItem>
                    <SelectItem value="reviewer">Reviewer (Audit &amp; Compliance)</SelectItem>
                    <SelectItem value="accountant">Accountant (Payroll &amp; Uploads)</SelectItem>
                    <SelectItem value="management">Management (Approvals Only)</SelectItem>
                    <SelectItem value="member">General Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider">Audit Justification <AlertCircle className="h-3 w-3 text-destructive" /></Label>
                <Textarea name="justification" placeholder="Reason for this role assignment or profile change..." required className="rounded-xl min-h-[80px] bg-muted border-none" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-bold text-lg shadow-lg">
                {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Invite Member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <form onSubmit={handleBulkUpload}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Enrollment
              </DialogTitle>
              <DialogDescription>Enroll multiple members at once using a CSV data file.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
               <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Standard Template</p>
                    <p className="text-[10px] text-muted-foreground">Download required CSV format</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate} className="h-9 px-4 rounded-lg bg-white border border-border shadow-sm text-xs font-bold">
                    <Download className="mr-2 h-3.5 w-3.5" /> Template
                  </Button>
               </div>
               <div className="grid gap-2">
                 <Label className="text-xs font-bold uppercase tracking-wider">Upload CSV File</Label>
                 <Input ref={fileInputRef} type="file" accept=".csv" required className="h-11 rounded-xl bg-muted border-none py-2" />
               </div>
               <div className="grid gap-2">
                 <Label className="text-xs font-bold uppercase tracking-wider">Audit Context</Label>
                 <Textarea name="justification" placeholder="Context for bulk creation (e.g. New cohort registration)" required className="rounded-xl bg-muted border-none min-h-[80px]" />
               </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-bold shadow-lg">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Process Bulk Enrollment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-card">
        <CardHeader className="bg-muted/20 pb-6 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search participants by name, email or phone..." className="pl-10 h-12 rounded-xl bg-white shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-4 px-6 font-bold uppercase text-[12px] tracking-widest">Member Details</TableHead>
                <TableHead className="font-bold uppercase text-[12px] tracking-widest">Role</TableHead>
                <TableHead className="font-bold uppercase text-[12px] tracking-widest">Status</TableHead>
                <TableHead className="text-right px-6 font-bold uppercase text-[12px] tracking-widest">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-48 text-center text-muted-foreground italic font-medium">No participants found matching your criteria.</TableCell></TableRow>
              ) : (
                filteredMembers.map((member: any) => (
                  <TableRow key={member.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{member.name}</span>
                        {member.deletionRequested && (
                          <Badge variant="outline" className="text-[9px] font-bold uppercase bg-amber-500/10 text-amber-700 border-amber-300">
                            Deletion Requested
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "capitalize font-bold text-[10px] px-3 border-none",
                          member.role === 'admin' && "bg-primary/10 text-primary",
                          member.role === 'auditor' && "bg-purple-600/10 text-purple-700 dark:text-purple-400",
                          member.role === 'reviewer' && "bg-green-600/10 text-green-700 dark:text-green-400",
                          member.role === 'accountant' && "bg-blue-500/10 text-blue-600",
                          member.role === 'management' && "bg-foreground/10 text-foreground",
                          (!member.role || member.role === 'member') && "bg-muted text-muted-foreground"
                        )}
                      >
                        {member.role || 'member'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.status === 'active' ? 'default' : 'secondary'} className="uppercase text-[9px] font-bold px-3">
                        {member.status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6">
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl w-52 shadow-xl">
                          <DropdownMenuItem className="font-bold" onClick={() => { setSelectedMember(member); setIsEditing(true); setIsAddDialogOpen(true); }}>Edit Role & Profile</DropdownMenuItem>
                          {member.status !== 'active' && (
                            <DropdownMenuItem 
                              className="font-bold text-primary flex items-center gap-1.5 focus:text-primary focus:bg-primary/10" 
                              onClick={() => handleResendActivation(member)}
                            >
                              <Mail className="h-4 w-4" /> Send Activation Email
                            </DropdownMenuItem>
                          )}
                          {member.deletionRequested && (
                            <DropdownMenuItem asChild className="font-bold text-amber-700">
                              <Link href="/admin/approvals">Review Deletion Request</Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-destructive font-bold flex items-center gap-1.5 focus:text-destructive focus:bg-destructive/10" 
                            onClick={() => {
                              setMemberToDelete(member);
                              setDeleteJustification('');
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <UserX className="h-4 w-4" /> Delete Account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                       </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Super Admin Direct Delete Member Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card border border-border shadow-2xl p-0 overflow-hidden">
          <form onSubmit={handleDeleteMemberSubmit}>
            <DialogHeader className="p-5 bg-destructive text-destructive-foreground">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-white">
                <UserX className="h-5 w-5" /> Direct Account Deletion
              </DialogTitle>
              <DialogDescription className="text-red-100 text-xs mt-1">
                Delete {memberToDelete?.name || memberToDelete?.email}&apos;s account directly without member request.
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4">
              {/* Member Summary */}
              <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2 text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 text-destructive rounded-xl shrink-0">
                    <UserX className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">{memberToDelete?.name}</p>
                    <p className="text-muted-foreground">{memberToDelete?.email}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t">
                  <span className="text-muted-foreground">System Role:</span>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">{memberToDelete?.role || 'member'}</Badge>
                </div>
                {memberToDelete?.deletionRequested && (
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    Member previously requested deletion. Direct deletion will resolve the request.
                  </div>
                )}
              </div>

              {/* Warning Alert */}
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  This action permanently revokes login credentials, deletes the member user record, and records an official audit trail. Any outstanding loan debt must be settled first.
                </p>
              </div>

              {/* Justification input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Administrative Justification <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={deleteJustification}
                  onChange={e => setDeleteJustification(e.target.value)}
                  placeholder="Official reason for account deletion (e.g. Inactivity, scheme withdrawal, disciplinary termination)..."
                  required
                  rows={3}
                  className="text-xs rounded-xl bg-muted border-none resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-muted/20 border-t flex items-center justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => { setIsDeleteDialogOpen(false); setMemberToDelete(null); }} 
                className="rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isDeletingMember || !deleteJustification.trim()} 
                variant="destructive" 
                className="rounded-xl text-xs font-bold gap-1.5 shadow-md"
              >
                {isDeletingMember ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Confirm &amp; Delete Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
