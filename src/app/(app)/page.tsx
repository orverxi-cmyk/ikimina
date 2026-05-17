'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, HandCoins, Users, TrendingUp } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection } from '@/firebase/firestore/hooks';
import { collection, doc, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  
  const stats = [
    { title: 'Total Tontine Balance', value: '4,250,000 RWF', icon: Wallet, color: 'text-green-500' },
    { title: 'Total Contributions', value: '12,500,000 RWF', icon: TrendingUp, color: 'text-blue-500' },
    { title: 'Active Loans', value: '1,800,000 RWF', icon: HandCoins, color: 'text-orange-500' },
    { title: 'Total Members', value: '15', icon: Users, color: 'text-purple-500' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-headline font-bold">Financial Overview</h1>
        <p className="text-muted-foreground">Ikimina App Dashboard</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-md bg-card/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={cn("h-5 w-5", stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle>My Participation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-background rounded-lg border">
              <span className="text-muted-foreground">My Contributions</span>
              <span className="font-bold text-lg">850,000 RWF</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-background rounded-lg border">
              <span className="text-muted-foreground">Outstanding Loans</span>
              <span className="font-bold text-lg text-orange-500">200,000 RWF</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 hover:bg-accent rounded-lg transition-colors cursor-pointer border border-transparent hover:border-border">
                <div className="bg-primary/10 p-2 rounded-full text-primary">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Monthly Contribution - Nov</p>
                  <p className="text-xs text-muted-foreground">Due in 5 days</p>
                </div>
                <span className="text-sm font-bold">50,000 RWF</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
