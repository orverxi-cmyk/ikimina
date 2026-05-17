'use client';

import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, UserPlus, Loader2, ShieldAlert, Download, Calendar as CalendarIcon, Upload } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCollection, useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

export default function MembersPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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

  const handleDownloadTemplate = () => {
    const headers = ['First Name', 'Surname', 'Email', 'Phone', 'Role (admin/management/member)'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ikimina_members_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split('\n').filter(row => row.trim() !== '');
      // Skip headers
      const dataRows = rows.slice(1);

      if (dataRows.length === 0) {
        toast({ variant: "destructive", title: "Empty File", description: "No data found in the uploaded file." });
        return;
      }

      setIsSubmitting(true);
      let successCount = 0;
      let failCount = 0;

      try {
        for (const row of dataRows) {
          const [firstName, surname, email, phone, role] = row.split(',').map(s => s.trim());
          if (!email || !firstName) {
            failCount++;
            continue;
          }

          await addDoc(collection(firestore, 'users'), {
            name: `${firstName} ${surname}`.trim(),
            email: email.toLowerCase(),
            phone: phone || '',
            role: (role?.toLowerCase() as any) || 'member',
            joinedAt: serverTimestamp(),
            status: 'pending',
          });
          successCount++;
        }

        toast({ 
          title: "Bulk Upload Complete", 
          description: `Successfully invited ${successCount} members. ${failCount > 0 ? `Failed to process ${failCount} rows.` : ''}` 
        });
      } catch (error) {
        toast({ variant: "destructive", title: "Upload Error", description: "An error occurred during bulk processing." });
      } finally {
        setIsSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const firstName = formData.get('firstName') as string;
    const surname = formData.get('surname') as string;
    
    const memberData: any = {
      name: `${firstName} ${surname}`.trim(),
      email: (formData.get('email') as string).toLowerCase(),
      phone: formData.get('phone') as string,
      role: formData.get('role') as string,
    };

    try {
      if (isEditing && selectedMember) {
        await updateDoc(doc(firestore, 'users', selectedMember.id), memberData);
        toast({ title: "Success", description: "Member updated successfully." });
      } else {
        await addDoc(collection(firestore, 'users'), {
          ...memberData,
          joinedAt: serverTimestamp(),
          status: 'pending',
        });
        toast({ title: "Invited", description: "Member has been added with 'pending' status." });
      }
      setIsAddDialogOpen(false);
      setIsEditing(false);
      setSelectedMember(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save member details." });
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
        <p className="text-muted-foreground">Only administrators can manage members.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Member Directory</h1>
          <p className="text-muted-foreground">Manage Ikimina App participants and legal standings</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <Button variant="outline" onClick={handleDownloadTemplate} className="rounded-xl">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-xl" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload CSV
          </Button>
          <Button onClick={() => { setIsEditing(false); setSelectedMember(null); setIsAddDialogOpen(true); }} className="rounded-xl shadow-lg shadow-primary/20">
            <UserPlus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">{isEditing ? 'Edit Member Profile' : 'Register New Member'}</DialogTitle>
              <DialogDescription>
                Ensure legal names match official identification documents.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input 
                    id="firstName"
                    name="firstName" 
                    placeholder="e.g. Jean"
                    defaultValue={selectedMember ? splitName(selectedMember.name).firstName : ''} 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="surname">Surname</Label>
                  <Input 
                    id="surname"
                    name="surname" 
                    placeholder="e.g. Mugisha"
                    defaultValue={selectedMember ? splitName(selectedMember.name).surname : ''} 
                    required 
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email"
                  name="email" 
                  type="email" 
                  placeholder="member@example.com"
                  defaultValue={selectedMember?.email} 
                  required 
                  disabled={isEditing} 
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input 
                  id="phone"
                  name="phone" 
                  placeholder="+250..."
                  defaultValue={selectedMember?.phone} 
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">System Access Role</Label>
                <Select name="role" defaultValue={selectedMember?.role || 'member'}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator (Full Control)</SelectItem>
                    <SelectItem value="management">Management Team (Approvals)</SelectItem>
                    <SelectItem value="member">General Member (View Own Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEditing ? 'Update Member Profile' : 'Register Member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">{selectedMember?.name}'s Repayment Schedule</DialogTitle>
            <DialogDescription>Full amortization overview for active loans.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedMember?.amortizationSchedule ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Installment</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMember.amortizationSchedule.map((inst: any, idx: number) => {
                      const d = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">#{inst.installmentNumber || idx + 1}</TableCell>
                          <TableCell>{format(d, 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-bold">{inst.amount?.toLocaleString()} RWF</TableCell>
                          <TableCell>
                            <Badge 
                              variant={inst.status === 'paid' ? 'default' : 'secondary'} 
                              className={cn(
                                "rounded-lg font-bold uppercase text-[10px]",
                                inst.status === 'paid' && "bg-green-500 hover:bg-green-600"
                              )}
                            >
                              {inst.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic space-y-4">
                <CalendarIcon className="h-12 w-12 opacity-20" />
                <p>No active loan schedule found for this user.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/20 pb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, email, or phone..." 
              className="pl-10 h-11 bg-background rounded-xl border-primary/10" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="py-4 px-6">Member Details</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                    {searchTerm ? "No members match your search criteria." : "No members found in the directory."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member: any) => (
                  <TableRow key={member.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="py-4 px-6">
                      <div className="font-bold text-lg">{member.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span>{member.email}</span>
                        {member.phone && <span>• {member.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize border-primary/20 text-primary font-bold">
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={member.status === 'active' ? 'default' : 'secondary'} 
                        className={cn(
                          "rounded-lg font-bold uppercase text-[10px]",
                          member.status === 'active' ? "bg-green-500" : "bg-orange-500/10 text-orange-600"
                        )}
                      >
                        {member.status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <div className="flex justify-end gap-2">
                         <Button 
                           size="icon" 
                           variant="ghost" 
                           className="rounded-lg hover:bg-primary/10 hover:text-primary"
                           onClick={() => { setSelectedMember(member); setIsDetailOpen(true); }}
                         >
                           <CalendarIcon className="h-4 w-4" />
                         </Button>
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-lg">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl w-48">
                            <DropdownMenuItem 
                              className="py-2.5"
                              onClick={() => { setSelectedMember(member); setIsEditing(true); setIsAddDialogOpen(true); }}
                            >
                              Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="py-2.5 text-destructive focus:text-destructive"
                              onClick={async () => {
                                if(confirm(`Confirm deletion of member: ${member.name}? This action is irreversible.`)) {
                                  await deleteDoc(doc(firestore, 'users', member.id));
                                  toast({ title: "Deleted", description: "Member record has been removed." });
                                }
                              }}
                            >
                              Remove Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                         </DropdownMenu>
                      </div>
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