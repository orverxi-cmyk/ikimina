'use client';

import { useMemo } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc, useMemoFirebase } from '@/firebase/firestore/hooks';
import { doc, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { format, isPast, addDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bell, AlertTriangle, MessageSquare, Search, Loader2 } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';

export default function MessagesPage() {
  const { user, loading: authLoading } = useUser();
  const firestore = useFirestore();
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user]);
  const { data: userData, loading: userDataLoading } = useDoc(userRef);

  const notifications = useMemo(() => {
    if (!userData?.amortizationSchedule) return [];
    const now = new Date();
    const alerts: any[] = [];

    userData.amortizationSchedule.forEach((inst: any) => {
      if (inst.status === 'paid') return;

      const dueDate = inst.dueDate instanceof Timestamp ? inst.dueDate.toDate() : new Date(inst.dueDate);
      const isOverdue = isPast(dueDate);
      const isUpcoming = isWithinInterval(dueDate, {
        start: startOfDay(now),
        end: endOfDay(addDays(now, 2))
      });

      if (isOverdue) {
        alerts.push({
          id: `overdue-${inst.installmentNumber}`,
          type: 'overdue',
          title: 'Repayment Overdue',
          message: `You have passed the due date for installment repayment. Please pay as soon as possible to avoid bad credit record.`,
          variant: 'destructive',
          icon: AlertTriangle
        });
      } else if (isUpcoming) {
        alerts.push({
          id: `upcoming-${inst.installmentNumber}`,
          type: 'upcoming',
          title: 'Upcoming Due Date',
          message: `Your loan is due on ${format(dueDate, 'MMM d, yyyy')}, pay before ${format(dueDate, 'MMM d, yyyy')} to avoid bad credit record.`,
          variant: 'default',
          className: 'border-orange-500 bg-orange-50/50',
          icon: Bell
        });
      }
    });

    return alerts;
  }, [userData]);

  if (authLoading || userDataLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full max-h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      {/* Conversation & Alerts List */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-card border-r flex flex-col">
        <div className="p-4 sm:p-6 border-b">
          <h2 className="font-headline text-[13px] font-bold">Inbox</h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search messages..." className="pl-10 h-10 rounded-xl bg-muted border-none text-[12px]" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 sm:p-4 space-y-4">
            {notifications.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">System Alerts</p>
                {notifications.map((notif) => (
                  <Alert key={notif.id} variant={notif.variant} className={cn("rounded-xl border shadow-sm cursor-default", notif.className)}>
                    <notif.icon className="h-4 w-4" />
                    <AlertTitle className="text-[13px] font-bold">{notif.title}</AlertTitle>
                    <AlertDescription className="text-[12px] font-normal leading-normal">
                      {notif.message}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            
            <div className="pt-6 text-center text-muted-foreground px-4">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-[12px] font-bold">No direct messages</p>
              <p className="text-[12px] font-normal leading-relaxed">System notices and payment reminders will appear in this list.</p>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main View Area (Desktop) */}
      <div className="hidden md:flex flex-1 flex-col h-full items-center justify-center p-12 text-center space-y-4 bg-muted/5">
        <div className="bg-primary/5 p-8 rounded-full border border-primary/10">
           <Bell className="w-16 h-16 text-primary/40" />
        </div>
        <div className="space-y-2">
          <h3 className="text-[13px] font-bold font-headline">Your Ikimina Inbox</h3>
          <p className="text-muted-foreground max-w-sm mx-auto text-[12px] font-normal">
            Stay updated with secure system notifications, repayment reminders, and messages from the management team.
          </p>
        </div>
      </div>
    </div>
  );
}
