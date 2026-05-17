
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HandCoins, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function LoansPage() {
  const [isManagement] = useState(true); // Mock role check

  // Mock data
  const loans = [
    { id: '1', member: 'Jean-Luc Habimana', amount: '500,000', status: 'approved', progress: 60, due: '2023-12-01', penalty: '0' },
    { id: '2', member: 'Claude Karemera', amount: '200,000', status: 'requested', progress: 0, due: '-', penalty: '0' },
    { id: '3', member: 'Divine Ishimwe', amount: '1,000,000', status: 'overdue', progress: 20, due: '2023-10-01', penalty: '50,000' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loan Management</h1>
          <p className="text-muted-foreground">Track requests, approvals and repayments</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Request Loan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600 uppercase tracking-wider">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1,700,000 RWF</div>
          </CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600 uppercase tracking-wider">Overdue Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1,050,000 RWF</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-600 uppercase tracking-wider">Requested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">200,000 RWF</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loan Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Repayment</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Penalty</TableHead>
                {isManagement && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">{loan.member}</TableCell>
                  <TableCell>{loan.amount} RWF</TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "capitalize",
                      loan.status === 'approved' ? 'bg-green-500/20 text-green-500' : 
                      loan.status === 'overdue' ? 'bg-destructive/20 text-destructive' : 'bg-secondary'
                    )}>
                      {loan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[150px]">
                    <div className="space-y-1">
                      <div className="text-[10px] text-right text-muted-foreground">{loan.progress}%</div>
                      <Progress value={loan.progress} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{loan.due}</TableCell>
                  <TableCell className="text-destructive font-bold">{loan.penalty !== '0' ? `+${loan.penalty}` : '-'}</TableCell>
                  {isManagement && (
                    <TableCell className="text-right">
                      {loan.status === 'requested' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="text-green-500 border-green-500/20 hover:bg-green-500/10"><CheckCircle2 className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10"><XCircle className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost">Details</Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
