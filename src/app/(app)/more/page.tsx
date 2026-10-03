'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Wallet, 
  FileText, 
  Users, 
  ShieldCheck, 
  ChevronRight, 
  Settings, 
  ChartBar, 
  Home, 
  TrendingUp, 
  Receipt,
  FileSpreadsheet 
} from 'lucide-react';
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

  const [cachedRole, setCachedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) setCachedRole(stored);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const role = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');
  const isAdmin = role === 'admin';
  const isManagement = role === 'admin' || role === 'management' || role === 'accountant' || role === 'auditor';

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
        ...(isAdmin ? [
          { href: '/admin', label: 'Executive Console', icon: Home, description: 'Balance sheet and metrics' },
          { href: '/admin/contributions', label: 'Batch Approvals', icon: FileSpreadsheet, description: 'Approve pending batches' },
          { href: '/admin/distribute-interest', label: 'Distribute Interest', icon: TrendingUp, description: 'Allocate profits pro-rata' },
          { href: '/admin/expenses', label: 'Operating Expenses', icon: Receipt, description: 'Manage operational costs' },
        ] : []),
        { href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck, description: 'Immutable action logs' },
        { href: '/reports', label: 'Financial Reports', icon: ChartBar, description: 'Audits and yearly standing' },
        ...(isAdmin ? [
          { href: '/members', label: 'Member Directory', icon: Users, description: 'Manage system access' },
          { href: '/admin/settings', label: 'System Settings', icon: Settings, description: 'Global financial policies' }
        ] : []),
      ]
    });
  }

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl mx-auto pb-24">
      <div className="space-y-0.5">
        <h1 className="text-[13px] font-bold font-headline text-foreground">More Options</h1>
        <p className="text-[12px] font-bold text-muted-foreground">Access all Ikimina App features and settings</p>
      </div>

      {sections.map((section, idx) => (
        <div key={idx} className="space-y-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            {section.title}
          </h2>
          <div className="grid gap-2">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="hover:bg-accent/50 transition-colors border-none shadow-sm bg-card/50">
                  <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="bg-primary/10 p-2 sm:p-2.5 rounded-xl text-primary">
                        <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-[12px]">{item.label}</p>
                        <p className="text-[12px] font-normal text-muted-foreground">{item.description}</p>
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
