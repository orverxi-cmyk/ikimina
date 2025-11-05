import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1">
        {children}
      </main>
      <MobileNav />
      {/* Padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
