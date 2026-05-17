'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, UserPlus, Loader2, ShieldAlert, Download, Calendar as CalendarIcon } from 'lucide-react';
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
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function MembersPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userLoading } = useDoc(userRef);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const isAdmin = userData?.role === 'admin';

  const membersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name', 'asc')), []);
  const { data: membersSnap, loading: membersLoading } = useCollection(membersQuery);

  const members = useMemo(() => membersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [], [membersSnap]);

  const filteredMembers = useMemo(() => members.filter((m: any) => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone?.includes(searchTerm)
  ), [members, searchTerm]);

  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Email', 'Phone', 'Role (admin/management/member)'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ikimina_members_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const memberData: any = {
      name: formData.get('name') as string,
      email: (formData.get('email') as string).toLowerCase(),
      phone: formData.get('phone') as string,
      role: formData.get('role') as string,
    };

    try {
      if (isEditing && selectedMember) {
        await updateDoc(doc(firestore, 'users', selectedMember.id), memberData);
        toast({ title: "Success", description: "Member updated." });
      } else {
        await addDoc(collection(firestore, 'users'), {
          ...memberData,
          joinedAt: serverTimestamp(),
          status: 'pending',
        });
        toast({ title: "Invited", description: "Member can now activate their account via login." });
      }
      setIsAddDialogOpen(false);
      setIsEditing(false);
      setSelectedMember(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save member." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userLoading || membersLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return <div className="p-8 text-center"><ShieldAlert className="h-12 w-12 mx-auto mb-4" />Access Denied</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Member Directory</h1>
          <p className="text-muted-foreground">Manage participants and view loan schedules</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}><Download className="mr-2 h-4 w-4" /> Template</Button>
          <Button onClick={() => { setIsEditing(false); setSelectedMember(null); setIsAddDialogOpen(true); }}><UserPlus className="mr-2 h-4 w-4" /> Add New Member</Button>
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Member' : 'Add New Member'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input name="name" defaultValue={selectedMember?.name} required />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={selectedMember?.email} required disabled={isEditing} />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={selectedMember?.phone} />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select name="role" defaultValue={selectedMember?.role || 'member'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>Save Member</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog for Amortization Schedule View */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedMember?.name}'s Repayment Schedule</DialogTitle>
            <DialogDescription>Full amortization overview for active loans.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedMember?.amortizationSchedule ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          <TableCell>#{inst.installmentNumber || idx + 1}</TableCell>
                          <TableCell>{format(d, 'MMM d, yyyy')}</TableCell>
                          <TableCell>{inst.amount?.toLocaleString()} RWF</TableCell>
                          <TableCell>
                            <Badge variant={inst.status === 'paid' ? 'default' : 'secondary'} className={cn(inst.status === 'paid' && "bg-green-500 hover:bg-green-600")}>
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
              <div className="text-center py-8 text-muted-foreground italic">No active loan schedule found for this user.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search members..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member: any) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{member.role}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>{member.status || 'pending'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                       <Button size="icon" variant="ghost" onClick={() => { setSelectedMember(member); setIsDetailOpen(true); }}>
                         <CalendarIcon className="h-4 w-4" />
                       </Button>
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedMember(member); setIsEditing(true); setIsAddDialogOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            if(confirm("Remove member?")) await deleteDoc(doc(firestore, 'users', member.id));
                          }} className="text-destructive">Remove</DropdownMenuItem>
                        </DropdownMenuContent>
                       </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
