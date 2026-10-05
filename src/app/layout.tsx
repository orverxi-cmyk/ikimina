import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NetworkStatusBanner } from '@/components/network-status';
import { AppErrorBoundary } from '@/components/error-boundary';

export const metadata: Metadata = {
  title: 'Ikimina App',
  description: 'Manage SCDT Tontine contributions and loans efficiently.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <NetworkStatusBanner />
        <AppErrorBoundary>
          <FirebaseClientProvider>
            {children}
          </FirebaseClientProvider>
        </AppErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
