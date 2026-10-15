'use client';

import { useMemo, useState } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useCollection, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, collection, query, where, orderBy, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { isPast, addDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Bell, 
  AlertTriangle, 
  MessageSquare, 
  Search, 
  Loader2, 
  CheckCheck, 
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Receipt,
  Wallet,
  Landmark,
  Layers,
  Coins
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { parseSafeDate, safeFormatDate } from '@/lib/loan-utils';

const cleanNotificationText = (text?: string) => {
  if (!text) return '';
  return text
    .replace(/Action Required:\s*Confirm Bulk Loan Application/gi, 'Action Required: Confirm Loan Balance')
    .replace(/Bulk Loan Confirmed by Member/gi, 'Loan Balance Confirmed by Member')
    .replace(/\(Computerized bulk loan record\)/gi, '(Preexisting loan facility)')
    .replace(/\(Institutional bulk loan\)/gi, '(Preexisting loan facility)')
    .replace(/their bulk loan of/gi, 'their loan balance of')
    .replace(/bulk loan application/gi, 'loan balance');
};

export default function MessagesPage() {
  const { user, loading: authLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'unread' | 'approvals' | 'finance'>('all');
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);

  const isStaff = userData?.role && ['admin', 'management', 'accountant', 'senior_accountant', 'reviewer', 'auditor'].includes(userData.role);

  // Live query on Firestore notifications collection - every user queries their own notifications
  const notifQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'notifications'),
      where('recipientId', '==', user.uid)
    );
  }, [user, firestore]);

  const { data: notifSnap, loading: notifLoading } = useCollection(notifQuery);

  const firestoreNotifications = useMemo(() => {
    if (!notifSnap) return [];
    const list = notifSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        formattedDate: data.createdAt?.toDate ? safeFormatDate(data.createdAt.toDate(), 'MMM d, yyyy · HH:mm') : 'Recent'
      } as any;
    });

    return list.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
  }, [notifSnap]);

  // Existing schedule alerts (loan upcoming / overdue alerts)
  const scheduleAlerts = useMemo(() => {
    if (!userData?.amortizationSchedule) return [];
    const now = new Date();
    const alerts: any[] = [];

    userData.amortizationSchedule.forEach((inst: any) => {
      if (inst.status === 'paid') return;

      const dueDate = parseSafeDate(inst.dueDate);
      if (!dueDate) return;

      const isOverdue = isPast(dueDate);
      const isUpcoming = isWithinInterval(dueDate, {
        start: startOfDay(now),
        end: endOfDay(addDays(now, 2))
      });

      const dateStr = safeFormatDate(dueDate, 'MMM d, yyyy');

      if (isOverdue) {
        alerts.push({
          id: `overdue-${inst.installmentNumber}`,
          type: 'overdue',
          title: 'Repayment Overdue',
          message: `You have passed the due date for installment repayment. Please pay as soon as possible to avoid bad credit record.`,
          variant: 'destructive',
          icon: AlertTriangle,
          actionUrl: '/loans'
        });
      } else if (isUpcoming) {
        alerts.push({
          id: `upcoming-${inst.installmentNumber}`,
          type: 'upcoming',
          title: 'Upcoming Due Date',
          message: `Your loan is due on ${dateStr}, pay before ${dateStr} to avoid bad credit record.`,
          variant: 'default',
          className: 'border-primary/30 bg-primary/5',
          icon: Bell,
          actionUrl: '/loans'
        });
      }
    });

    return alerts;
  }, [userData]);

  // Combined and filtered notifications
  const filteredNotifications = useMemo(() => {
    return firestoreNotifications.filter(n => {
      // Category filter
      if (selectedCategory === 'unread' && n.read) return false;
      if (selectedCategory === 'approvals' && !['loan', 'expense', 'system'].includes(n.type)) return false;
      if (selectedCategory === 'finance' && !['contribution', 'interest', 'payout'].includes(n.type)) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return n.title?.toLowerCase().includes(q) || n.message?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [firestoreNotifications, selectedCategory, searchQuery]);

  const activeNotification = useMemo(() => {
    if (!activeNotificationId) return firestoreNotifications[0] || null;
    return firestoreNotifications.find(n => n.id === activeNotificationId) || null;
  }, [activeNotificationId, firestoreNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(firestore, 'notifications', id), {
        read: true,
        readAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('Failed to mark notification as read:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = firestoreNotifications.filter(n => !n.read);
    for (const n of unread) {
      try {
        await updateDoc(doc(firestore, 'notifications', n.id), {
          read: true,
          readAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Failed to mark notification as read:', e);
      }
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'loan': return Landmark;
      case 'contribution': return Wallet;
      case 'expense': return Receipt;
      case 'interest': return Coins;
      case 'system': return ShieldCheck;
      default: return Bell;
    }
  };

  if (authLoading || userDataLoading || notifLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = firestoreNotifications.filter(n => !n.read).length;

  return (
    <div className="h-full max-h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      {/* Notifications List Column */}
      <div className="w-full md:w-5/12 lg:w-4/12 bg-card border-r flex flex-col h-full">
        <div className="p-4 sm:p-5 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-headline text-sm font-bold text-foreground">Operational Inbox</h2>
              {unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                  {unreadCount} Unread
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleMarkAllAsRead} 
                className="h-7 text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search notifications & alerts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-xl bg-muted border-none text-[12px]" 
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer",
                selectedCategory === 'all' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              All ({firestoreNotifications.length})
            </button>
            <button
              onClick={() => setSelectedCategory('unread')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer",
                selectedCategory === 'unread' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setSelectedCategory('approvals')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer",
                selectedCategory === 'approvals' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Approvals & Loans
            </button>
            <button
              onClick={() => setSelectedCategory('finance')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer",
                selectedCategory === 'finance' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Savings & Profits
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 sm:p-4 space-y-3">
            {/* System Schedule Alerts (Repayment Due Reminders) */}
            {scheduleAlerts.length > 0 && selectedCategory === 'all' && (
              <div className="space-y-2 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                  Repayment Schedule Notices
                </p>
                {scheduleAlerts.map((alert) => (
                  <Alert key={alert.id} variant={alert.variant} className={cn("rounded-xl border shadow-sm", alert.className)}>
                    <alert.icon className="h-4 w-4" />
                    <AlertTitle className="text-[12px] font-bold">{alert.title}</AlertTitle>
                    <AlertDescription className="text-[11px] font-normal leading-normal mt-1">
                      {alert.message}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Live Firestore Notifications */}
            {filteredNotifications.length === 0 ? (
              <div className="pt-8 text-center text-muted-foreground px-4">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-[12px] font-bold">No notifications found</p>
                <p className="text-[11px] font-normal leading-relaxed mt-1">
                  {selectedCategory === 'unread' ? 'All notifications have been read.' : 'Operational actions and status updates will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const IconComponent = getTypeIcon(notif.type);
                const isSelected = activeNotification?.id === notif.id;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      setActiveNotificationId(notif.id);
                      if (!notif.read) handleMarkAsRead(notif.id);
                    }}
                    className={cn(
                      "p-3 rounded-xl border text-left cursor-pointer transition-all space-y-1 relative",
                      isSelected 
                        ? "border-primary bg-primary/5 shadow-sm" 
                        : "border-border/60 hover:border-border hover:bg-muted/40",
                      !notif.read && "bg-blue-50/40 dark:bg-blue-950/20"
                    )}
                  >
                    {!notif.read && (
                      <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
                    )}

                    <div className="flex items-center gap-2 pr-4">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        notif.severity === 'destructive' ? "bg-destructive/10 text-destructive" :
                        notif.severity === 'success' ? "bg-green-500/10 text-green-600" :
                        notif.severity === 'warning' ? "bg-amber-500/10 text-amber-600" :
                        "bg-primary/10 text-primary"
                      )}>
                        <IconComponent className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-foreground truncate flex-1">
                        {cleanNotificationText(notif.title)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed pl-7">
                      {cleanNotificationText(notif.message)}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1 pl-7">
                      <span>{notif.formattedDate}</span>
                      {notif.actionUrl && (
                        <span className="font-semibold text-primary flex items-center gap-0.5">
                          Open <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main View Area (Notification Details Panel) */}
      <div className="hidden md:flex flex-1 flex-col h-full bg-muted/10 p-8 sm:p-12 overflow-y-auto items-center justify-center">
        {activeNotification ? (
          <div className="w-full max-w-lg bg-card border rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <Badge variant={activeNotification.severity === 'destructive' ? 'destructive' : 'secondary'} className="text-[10px] uppercase font-bold tracking-wider">
                  {activeNotification.type || 'Operation'}
                </Badge>
                <h3 className="font-headline text-lg font-bold text-foreground mt-1">
                  {cleanNotificationText(activeNotification.title)}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Delivered on {activeNotification.formattedDate}
                </p>
              </div>
              {!activeNotification.read && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleMarkAsRead(activeNotification.id)}
                  className="rounded-xl text-xs"
                >
                  Mark read
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-foreground/90 leading-relaxed font-normal">
                {cleanNotificationText(activeNotification.message)}
              </p>
            </div>

            {activeNotification.actionUrl && (
              <div className="pt-4 border-t flex gap-3">
                <Button 
                  className="w-full rounded-xl font-bold flex items-center justify-center gap-2"
                  onClick={() => router.push(activeNotification.actionUrl)}
                >
                  <span>Open Associated Workflow</span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-4 max-w-sm">
            <div className="bg-primary/5 p-8 rounded-full border border-primary/10 inline-block">
              <Bell className="w-16 h-16 text-primary/40 mx-auto" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold font-headline text-foreground">Operational Notification Inbox</h3>
              <p className="text-muted-foreground text-xs font-normal leading-relaxed">
                Review dual-control reviews, member loan approvals, repayments, and financial allocations in real time.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
