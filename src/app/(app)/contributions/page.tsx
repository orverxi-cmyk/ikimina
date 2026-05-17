
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, History, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ContributionsPage() {
  const [amount, setAmount] = useState('50000');

  // Mock data
  const history = [
    { id: '1', member: 'Claude Karemera', amount: '50,000', period: 'October 2023', date: '2023-10-15' },
    { id: '2', member: 'Aisha Uwase', amount: '50,000', period: 'October 2023', date: '2023-10-14' },
    { id: '3', member: 'Jean-Luc Habimana', amount: '50,000', period: 'October 2023', date: '2023-10-12' },
  ];

  const unpaid = [
    { name: 'Divine Ishimwe', period: 'October 2023' },
    { name: 'Emanuel Nshimiye', period: 'October 2023' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-headline font-bold">Contribution Tracking</h1>
        <p className="text-muted-foreground">Manual recording of member payments</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Record Payment Form */}
        <Card className="lg:col-span-1 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Wallet className="h-5 w-5" /> Record Payment
            </CardTitle>
            <CardDescription>Enter details of a manual payment received</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Member</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Choose a member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Claude Karemera</SelectItem>
                  <SelectItem value="2">Aisha Uwase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select defaultValue="oct23">
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oct23">October 2023</SelectItem>
                  <SelectItem value="nov23">November 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (RWF)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <Button className="w-full">Confirm Record</Button>
          </CardContent>
        </Card>

        {/* Unpaid Alerts & History */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" /> Pending for Current Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unpaid.map((m, i) => (
                  <Alert key={i} variant="default" className="border-orange-500/20 bg-orange-500/5">
                    <AlertTitle className="text-orange-500 font-bold">{m.name}</AlertTitle>
                    <AlertDescription className="text-xs">Missed {m.period} payment</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Payments
              </CardTitle>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">Clear History</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.member}</TableCell>
                      <TableCell>{h.period}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{h.date}</TableCell>
                      <TableCell className="text-right font-bold">{h.amount} RWF</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
