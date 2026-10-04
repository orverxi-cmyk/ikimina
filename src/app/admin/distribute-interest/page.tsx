'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function DistributeInterestRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/approvals');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-semibold text-muted-foreground">
        Redirecting to Approvals Hub...
      </p>
    </div>
  );
}
