'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Wallet, FileText, Users, ShieldCheck, ChevronRight, Settings, ChartBar } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';

export default function MorePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const role = userData?.role || 'member';
  const isAdmin = role === 'admin';
  const isManagement = role === 'admin' || role === 'management';

  const sections = [
    {
      title: 'Financials',
      items: [
        { href: '/contributions', label: 'My Contributions', icon: Wallet, description: 'View your payment history' },
      ]
    }
  ];

  if (isManagement) {
    sections.push({
      title: 'Management Tools',
      items: [
        { href: '/reports', label: 'Financial Reports', icon: ChartBar, description: 'Audits and yearly standing' },
        ...(isAdmin ? [
          { href: '/members', label: 'Member Directory', icon: Users, description: 'Manage system access' },
          { href: '/admin/settings', label: 'System Settings', icon: Settings, description: 'Global financial policies' }
        ] : []),
      ]
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto pb-24">
      <div className="space-y-1">
        <h1 className="text-2xl font-headline font-bold">More Options</h1>
        <p className="text-sm text-muted-foreground">Access all Ikimina App features and settings</p>
      </div>

      {sections.map((section, idx) => (
        <div key={idx} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">
            {section.title}
          </h2>
          <div className="grid gap-2">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="hover:bg-accent/50 transition-colors border-none shadow-sm bg-card/50">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="pt-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">
              Secure Infrastructure Provided by ORVEXI
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
