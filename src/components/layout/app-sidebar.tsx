'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home,
  LayoutDashboard, 
  Users, 
  Wallet, 
  HandCoins, 
  FileText, 
  Settings,
  Landmark,
  FileSpreadsheet,
  Receipt,
  ShieldCheck,
  TrendingUp,
  UserX,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { AvatarUpload } from '@/components/ui/avatar-upload';

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();
  
  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: userData, loading: docLoading } = useDoc(userRef);
  
  const [mounted, setMounted] = useState(false);
  const [cachedRole, setCachedRole] = useState<string | null>(null);

  // Initialize cached role from localStorage immediately to eliminate asynchronous role flash
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && user?.uid) {
      const stored = localStorage.getItem(`ikimina_role_${user.uid}`);
      if (stored) {
        setCachedRole(stored);
      }
    }
  }, [user?.uid]);

  // Persist updated authoritative role whenever Firestore emits
  useEffect(() => {
    if (userData?.role && user?.uid) {
      setCachedRole(userData.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ikimina_role_${user.uid}`, userData.role);
      }
    }
  }, [userData?.role, user?.uid]);

  // Primary admin check fallback (ensures administrator privileges are never lost)
  const isPrimaryAdmin = user?.email?.toLowerCase() === 'tharushyamagara@gmail.com';
  const role = userData?.role || cachedRole || (isPrimaryAdmin ? 'admin' : 'member');

  // Prevent flash of member-only state while document is loading if no cached role exists
  if (!mounted || (docLoading && !cachedRole && !isPrimaryAdmin)) {
    return (
      <aside className="hidden md:flex flex-col w-64 rounded-[10px] bg-background border border-border shadow-sm p-4 overflow-hidden">
        <div className="bg-blue-600 -m-4 mb-4 px-5 py-3.5">
          <div className="h-3 w-32 bg-white/30 rounded animate-pulse" />
        </div>
        <div className="animate-pulse flex flex-col gap-2.5 mt-2">
          <div className="h-9 bg-muted rounded-lg" />
          <div className="h-9 bg-muted rounded-lg" />
          <div className="h-9 bg-muted rounded-lg" />
          <div className="h-9 bg-muted rounded-lg" />
          <div className="h-4 w-28 bg-muted rounded mt-3" />
          <div className="h-9 bg-muted rounded-lg" />
          <div className="h-9 bg-muted rounded-lg" />
        </div>
      </aside>
    );
  }

  const isSuperAdmin = role === 'admin';
  const isAccountant = role === 'accountant';
  const isReviewer = role === 'reviewer' || role === 'management';
  const isAuditor = role === 'auditor';

  // 1. Member Services Navigation (Available to all authenticated members & staff)
  const memberItems = [
    { href: '/', label: 'My Account', icon: LayoutDashboard },
    { href: '/contributions', label: 'Contributions', icon: Wallet },
    { href: '/loans', label: 'Loan Portfolio', icon: Landmark },
    { href: '/loans/apply', label: 'Apply for Loan', icon: HandCoins },
    { href: '/messages', label: 'Inbox', icon: MessageSquare },
    { href: '/profile/me?tab=account', label: 'Delete Account', icon: UserX, isDestructive: true },
  ];

  // 2. Executive Administrator & Console Tools (Persistently accessible to authorized roles)
  const adminItems: { href: string; label: string; icon: any }[] = [];

  if (isSuperAdmin) {
    adminItems.push({ href: '/admin', label: 'Dashboard', icon: Home });
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/admin/expenses', label: 'Operating Expenses', icon: Receipt });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
    adminItems.push({ href: '/members', label: 'Members Directory', icon: Users });
    adminItems.push({ href: '/admin/settings', label: 'Settings', icon: Settings });
  } else if (isAuditor) {
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF Report', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  } else if (isAccountant) {
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/admin/expenses', label: 'Operating Expenses', icon: Receipt });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  } else if (isReviewer) {
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }

  const hasManagementTools = adminItems.length > 0;

  return (
    <aside className="hidden md:flex flex-col w-64 bg-background rounded-[10px] shadow-sm border border-border shrink-0 overflow-hidden">
      {/* Header with Blue Background */}
      <div className="bg-blue-600 px-5 py-3.5 border-b border-blue-700/60 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white">
          {isSuperAdmin
            ? 'Administrator Console'
            : isAuditor
            ? 'Auditor Console'
            : isAccountant
            ? 'Accountant Console'
            : isReviewer
            ? 'Reviewer Console'
            : 'Member Portal'}
        </h2>
        {isSuperAdmin && (
          <span className="text-[9px] bg-white/20 text-white font-extrabold px-1.5 py-0.5 rounded uppercase">
            Admin
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col p-4 sm:p-5 space-y-6 overflow-y-auto">
        <nav className="flex-1 space-y-4">
          {/* Administrator / Management Tools Group */}
          {hasManagementTools && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                {isSuperAdmin ? 'Management & Controls' : 'Administrative Tools'}
              </p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.01]'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Member Services Group */}
          <div className="space-y-1">
            {hasManagementTools && (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-1.5 pt-2 border-t border-border/60">
                Member Services
              </p>
            )}
            {memberItems.map((item) => {
              const isItemActive = item.href.includes('?')
                ? pathname === item.href.split('?')[0]
                : pathname === item.href;

              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all duration-200',
                    item.isDestructive
                      ? isItemActive
                        ? 'bg-destructive/15 text-destructive border border-destructive/30'
                        : 'text-destructive/80 hover:bg-destructive/10 hover:text-destructive'
                      : isItemActive
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.01]'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", item.isDestructive && "text-destructive")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Session Footer */}
        <div className="pt-4 border-t border-border">
          {user && (
            <div className="px-3.5 py-2.5 bg-muted rounded-[10px] border border-border space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Logged In As</p>
                <Link 
                  href="/profile/me?tab=account" 
                  className="text-[10px] font-bold text-destructive hover:underline flex items-center gap-1"
                  title="Request Account Deletion"
                >
                  <UserX className="h-3 w-3" />
                  Delete Account
                </Link>
              </div>
              <div className="flex items-center gap-2.5">
                <AvatarUpload
                  uid={user.uid}
                  currentPhotoURL={userData?.photoURL ?? user.photoURL}
                  displayName={userData?.name ?? user.displayName}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <Link href="/profile/me" className="hover:underline">
                    <p className="text-xs font-bold truncate text-foreground">{userData?.name || user.email}</p>
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                    <span className="text-[9px] text-primary font-bold uppercase tracking-tight">{role}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
