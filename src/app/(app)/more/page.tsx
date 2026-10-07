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
  FileSpreadsheet,
  Info,
  Scale,
  Lock,
  UserX,
  UserMinus
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useSettings } from '@/context/settings-context';
import { LegalPolicyModal } from '@/components/layout/app-footer';

export default function MorePage() {
  const { settings } = useSettings();
  const { user } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData } = useDoc(userRef);

  const [cachedRole, setCachedRole] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'about' | 'terms' | 'privacy'>('about');

  const openLegalModal = (tab: 'about' | 'terms' | 'privacy') => {
    setModalTab(tab);
    setModalOpen(true);
  };

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
  const isManagement = role === 'admin' || role === 'management' || (role === 'accountant' || role === 'senior_accountant') || role === 'auditor';

  const sections = [
    {
      title: 'Financials',
      items: [
        { href: '/contributions', label: 'Savings', icon: Wallet, description: 'View your savings and deposit history' },
      ]
    },
    {
      title: 'Account & Security',
      items: [
        { href: '/profile/me', label: 'Profile & Membership', icon: Users, description: 'View capital standing and member details' },
        { href: '/profile/me?tab=account', label: 'Delete Account', icon: UserX, description: 'Submit or view status of account deletion request' },
      ]
    }
  ];

  if (isManagement) {
    sections.push({
      title: 'Management Tools',
      items: [
        ...(isAdmin ? [
          { href: '/admin', label: 'Dashboard', icon: Home, description: 'Balance sheet and metrics' },
          { href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck, description: 'Audit and approve pending requests' },
          { href: '/admin/expenses', label: 'Operating Expenses', icon: Receipt, description: 'Manage operational costs' },
        ] : []),
        ...(isAdmin || role === 'accountant' || role === 'senior_accountant' ? [
          { href: '/admin/final-payouts', label: 'Final Payouts', icon: UserMinus, description: 'Member exit settlements & account closure' },
        ] : []),
        { href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck, description: 'Immutable action logs' },
        { href: '/reports', label: 'Financial Reports', icon: ChartBar, description: 'Audits and yearly standing' },
        ...(isAdmin || (role === 'reviewer' || role === 'senior_accountant') ? [
          { href: '/members', label: 'Member Directory', icon: Users, description: 'Manage system access' },
        ] : []),
        ...(isAdmin ? [
          { href: '/admin/settings', label: 'System Settings', icon: Settings, description: 'Global financial policies' }
        ] : []),
      ]
    });
  }

  const currentYear = new Date().getFullYear();
  const appName = settings.appName?.trim() || 'Ikimina App';
  const copyrightText = settings.copyrightNotice?.trim() || `© ${currentYear} ${appName}. All rights reserved.`;

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl mx-auto pb-24">
      <div className="space-y-0.5">
        <h1 className="text-[13px] font-bold font-headline text-foreground">More Options</h1>
        <p className="text-[12px] font-bold text-muted-foreground">Access all {appName} features and settings</p>
      </div>

      {sections.map((section, idx) => (
        <div key={idx} className="space-y-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            {section.title}
          </h2>
          <div className="grid gap-2">
            {section.items.map((item, itemIdx) => {
              const isDeleteAccount = item.href.includes('tab=account');
              return (
                <Link key={`${item.href}-${item.label}-${itemIdx}`} href={item.href}>
                  <Card className={cn(
                    "hover:bg-accent/50 transition-colors border shadow-sm bg-card/50",
                    isDeleteAccount ? "border-destructive/20 hover:border-destructive/40" : "border-none"
                  )}>
                    <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className={cn(
                          "p-2 sm:p-2.5 rounded-xl",
                          isDeleteAccount ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                        )}>
                          <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                        <div>
                          <p className={cn("font-bold text-[12px]", isDeleteAccount && "text-destructive")}>{item.label}</p>
                          <p className="text-[12px] font-normal text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                      <ChevronRight className={cn("h-4 w-4", isDeleteAccount ? "text-destructive" : "text-muted-foreground")} />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Platform & Legal Policies Section */}
      <div className="space-y-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground px-1">
          Platform &amp; Legal Policies
        </h2>
        <div className="grid gap-2">
          <Card 
            onClick={() => openLegalModal('about')}
            className="hover:bg-accent/50 transition-colors border-none shadow-sm bg-card/50 cursor-pointer"
          >
            <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-primary/10 p-2 sm:p-2.5 rounded-xl text-primary">
                  <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <p className="font-bold text-[12px]">About {appName}</p>
                  <p className="text-[12px] font-normal text-muted-foreground">Purpose, mission, and scheme background</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>

          <Card 
            onClick={() => openLegalModal('terms')}
            className="hover:bg-accent/50 transition-colors border-none shadow-sm bg-card/50 cursor-pointer"
          >
            <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-primary/10 p-2 sm:p-2.5 rounded-xl text-primary">
                  <Scale className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <p className="font-bold text-[12px]">Terms of Service</p>
                  <p className="text-[12px] font-normal text-muted-foreground">Governance rules, contributions, and loan terms</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>

          <Card 
            onClick={() => openLegalModal('privacy')}
            className="hover:bg-accent/50 transition-colors border-none shadow-sm bg-card/50 cursor-pointer"
          >
            <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-primary/10 p-2 sm:p-2.5 rounded-xl text-primary">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <p className="font-bold text-[12px]">Privacy Policy</p>
                  <p className="text-[12px] font-normal text-muted-foreground">Member data protection and security commitments</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pt-2 space-y-2">
        <Card className="border-primary/20 bg-primary/5 rounded-2xl shadow-xs">
          <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-2.5">
              <div className="p-1 rounded-lg bg-primary/10 text-primary shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold uppercase tracking-wider" suppressHydrationWarning>
                {settings.infrastructureBranding?.trim() || "Secure Infrastructure Provided by ORVEXI"}
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground font-medium text-center sm:text-right shrink-0" suppressHydrationWarning>
              {copyrightText}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal Dialog */}
      <LegalPolicyModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        initialTab={modalTab}
      />
    </div>
  );
}
