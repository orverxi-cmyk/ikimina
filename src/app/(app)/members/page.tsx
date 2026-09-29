'use client';

import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, UserPlus, Loader2, ShieldAlert, Download, Calendar as CalendarIcon, Upload, AlertCircle, FileSpreadsheet } from 'lucide-react';
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
import { collection, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { registerMemberAction, bulkRegisterMembersAction, logAdminAction, updateUserRoleAction } from '@/lib/finance-client';

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

        await updateDoc(doc(firestore, 'users', selectedMember.id), {
          name: `${memberData.firstName} ${memberData.surname}`.trim(),
          phone: memberData.phone,
        });
        
        toast({ title: "Profile Updated", description: "Member profile and role synchronization complete." });
      } else {
        await registerMemberAction(user.uid, memberData);
        toast({ title: "Invited", description: "Member registered successfully." });
      }
      setIsAddDialogOpen(false);
      setIsEditing(false);
      setSelectedMember(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Operation Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
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

        await bulkRegisterMembersAction(user.uid, data, justification);
        toast({ title: "Success", description: `${data.length} members processed for system enrollment.` });
        setIsBulkDialogOpen(false);
      };
      reader.readAsText(file);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Bulk Upload Failed", description: error.message });
    } finally {
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
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Member Directory</h1>
          <p className="text-muted-foreground font-medium">Assign roles and manage participant access</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <Button variant="outline" onClick={() => setIsBulkDialogOpen(true)} className="rounded-xl border-primary/20 text-primary font-bold">
             <Upload className="mr-2 h-4 w-4" /> Bulk Enrollment
           </Button>
           <Button onClick={() => { setIsEditing(false); setSelectedMember(null); setIsAddDialogOpen(true); }} className="rounded-xl shadow-lg font-bold">
             <UserPlus className="mr-2 h-4 w-4" /> Add Member
           </Button>
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">{isEditing ? 'Edit Access & Profile' : 'Register New Member'}</DialogTitle>
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
              <TableRow className="bg-muted/30">
                <TableHead className="py-4 px-6 font-bold uppercase text-[10px] tracking-widest">Member Details</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-widest">Role</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-widest">Status</TableHead>
                <TableHead className="text-right px-6 font-bold uppercase text-[10px] tracking-widest">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-48 text-center text-muted-foreground italic font-medium">No participants found matching your criteria.</TableCell></TableRow>
              ) : (
                filteredMembers.map((member: any) => (
                  <TableRow key={member.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="py-4 px-6">
                      <div className="font-bold text-sm">{member.name}</div>
                      <div className="text-[11px] text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize border-primary/20 text-primary font-bold text-[10px] px-3">
                        {member.role}
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
                        <DropdownMenuContent align="end" className="rounded-xl w-48 shadow-xl">
                          <DropdownMenuItem className="font-bold" onClick={() => { setSelectedMember(member); setIsEditing(true); setIsAddDialogOpen(true); }}>Edit Role & Profile</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive font-bold" onClick={async () => {
                              if(confirm(`Remove access for ${member.name}?`)) {
                                const justification = window.prompt("Reason for removal:");
                                if (!justification) return;
                                await deleteDoc(doc(firestore, 'users', member.id));
                                if (user) {
                                  await logAdminAction({ adminId: user.uid, action: 'DELETE_MEMBER', justification, details: { memberId: member.id } });
                                }
                                toast({ title: "Removed", description: "Access has been revoked." });
                              }
                            }}>Revoke Access</DropdownMenuItem>
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
    </div>
  );
}
