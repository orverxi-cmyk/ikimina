
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, MoreVertical, Edit2, Trash2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function MembersPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for members
  const members = [
    { id: '1', name: 'Jean-Luc Habimana', email: 'jeanluc@example.com', role: 'admin', phone: '+250 788 123 456', status: 'active' },
    { id: '2', name: 'Aisha Uwase', email: 'aisha@example.com', role: 'management', phone: '+250 788 987 654', status: 'active' },
    { id: '3', name: 'Claude Karemera', email: 'claude@example.com', role: 'member', phone: '+250 788 555 444', status: 'active' },
    { id: '4', name: 'Divine Ishimwe', email: 'divine@example.com', role: 'member', phone: '+250 788 333 222', status: 'inactive' },
  ];

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Member Directory</h1>
          <p className="text-muted-foreground">Manage SCDT Tontine participants and roles</p>
        </div>
        <Button className="w-full md:w-auto">
          <UserPlus className="mr-2 h-4 w-4" />
          Add New Member
        </Button>
      </div>

      <Card className="bg-card/50">
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search members by name, email or phone..." 
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id} className="hover:bg-accent/50 transition-colors">
                  <TableCell>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{member.phone}</TableCell>
                  <TableCell>
                    <Badge variant={member.status === 'active' ? 'outline' : 'destructive'} className="bg-green-500/10 text-green-500 border-green-500/20">
                      {member.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Edit2 className="mr-2 h-4 w-4" /> Edit Profile</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
