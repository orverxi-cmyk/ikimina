'use client';

import { useState } from 'react';
import { useSettings } from '@/context/settings-context';
import { 
  ShieldCheck, 
  Info, 
  FileText, 
  Scale, 
  Lock, 
  ExternalLink 
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DEFAULT_APP_NAME, getDefaultAbout, getDefaultTerms, getDefaultPrivacy } from '@/lib/legal-defaults';

export interface LegalPolicyModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'about' | 'terms' | 'privacy';
}

export function LegalPolicyModal({ isOpen, onOpenChange, initialTab = 'about' }: LegalPolicyModalProps) {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'about' | 'terms' | 'privacy'>(initialTab);

  // Sync tab if initialTab changes while opening
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setActiveTab(initialTab);
    }
    onOpenChange(open);
  };

  const appName = settings.appName?.trim() || DEFAULT_APP_NAME;
  const brandingText = settings.infrastructureBranding?.trim() || 'Secure Infrastructure Provided by ORVEXI';

  const aboutContent = settings.aboutUs?.trim() || getDefaultAbout(appName);
  const termsContent = settings.termsOfService?.trim() || getDefaultTerms(appName);
  const privacyContent = settings.privacyPolicy?.trim() || getDefaultPrivacy(appName);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl rounded-2xl p-0 overflow-hidden bg-card border shadow-2xl">
        <DialogHeader className="p-6 pb-4 bg-muted/30 border-b">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-primary/10 rounded-xl text-primary border border-primary/20">
              {activeTab === 'about' && <Info className="h-5 w-5" />}
              {activeTab === 'terms' && <Scale className="h-5 w-5" />}
              {activeTab === 'privacy' && <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-xl font-bold font-headline">
                Platform Information &amp; Legal Policies
              </DialogTitle>
              <DialogDescription className="text-xs">
                Official operational guidelines, governance policies, and platform information.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-4">
            <div className="w-full overflow-x-auto no-scrollbar pb-1">
              <TabsList className="inline-flex w-full min-w-max sm:min-w-0 sm:grid sm:grid-cols-3 h-11 p-1 bg-muted/60 rounded-xl gap-1">
                <TabsTrigger value="about" className="rounded-lg text-xs font-bold gap-1.5 px-3 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Info className="h-3.5 w-3.5" /> About Us
                </TabsTrigger>
                <TabsTrigger value="terms" className="rounded-lg text-xs font-bold gap-1.5 px-3 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <FileText className="h-3.5 w-3.5" /> Terms of Service
                </TabsTrigger>
                <TabsTrigger value="privacy" className="rounded-lg text-xs font-bold gap-1.5 px-3 whitespace-nowrap shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Lock className="h-3.5 w-3.5" /> Privacy Policy
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 1: About */}
            <TabsContent value="about" className="space-y-4 mt-2">
              <div className="p-5 rounded-xl bg-muted/30 border border-border/60 max-h-[50vh] overflow-y-auto space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Info className="h-4 w-4" /> About the Scheme
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line font-sans">
                  {aboutContent}
                </p>
              </div>
            </TabsContent>

            {/* Tab 2: Terms of Service */}
            <TabsContent value="terms" className="space-y-4 mt-2">
              <div className="p-5 rounded-xl bg-muted/30 border border-border/60 max-h-[50vh] overflow-y-auto space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Scale className="h-4 w-4" /> Rules of Participation &amp; Financial Governance
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line font-sans">
                  {termsContent}
                </p>
              </div>
            </TabsContent>

            {/* Tab 3: Privacy Policy */}
            <TabsContent value="privacy" className="space-y-4 mt-2">
              <div className="p-5 rounded-xl bg-muted/30 border border-border/60 max-h-[50vh] overflow-y-auto space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <ShieldCheck className="h-4 w-4" /> Confidentiality &amp; Member Data Protection
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line font-sans">
                  {privacyContent}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="p-6 pt-3 bg-muted/30 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground font-medium">
            {brandingText}
          </span>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold px-6 h-10 w-full sm:w-auto"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppFooter() {
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'about' | 'terms' | 'privacy'>('about');

  const openModal = (tab: 'about' | 'terms' | 'privacy') => {
    setActiveTab(tab);
    setIsOpen(true);
  };

  const currentYear = new Date().getFullYear();
  const copyrightText = settings.copyrightNotice?.trim() || `© ${currentYear} ${settings.appName?.trim() || DEFAULT_APP_NAME}. All rights reserved.`;
  const brandingText = settings.infrastructureBranding?.trim() || 'Secure Infrastructure Provided by ORVEXI';

  return (
    <>
      {/* Desktop App Footer */}
      <footer className="hidden md:block border-t border-border/40 bg-card/60 backdrop-blur-md px-6 py-4 mt-auto rounded-b-[10px] select-none">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          {/* Left: Copyright & Infrastructure */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground/80">{copyrightText}</span>
            <span className="text-muted-foreground/50">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {brandingText}
            </span>
          </div>

          {/* Right: Legal & Information Links */}
          <nav className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => openModal('about')}
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors font-medium cursor-pointer focus:outline-none"
            >
              <Info className="h-3.5 w-3.5" />
              About
            </button>

            <button
              type="button"
              onClick={() => openModal('terms')}
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors font-medium cursor-pointer focus:outline-none"
            >
              <FileText className="h-3.5 w-3.5" />
              Terms of Service
            </button>

            <button
              type="button"
              onClick={() => openModal('privacy')}
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors font-medium cursor-pointer focus:outline-none"
            >
              <Lock className="h-3.5 w-3.5" />
              Privacy Policy
            </button>
          </nav>
        </div>
      </footer>

      {/* Information & Legal Dialog */}
      <LegalPolicyModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        initialTab={activeTab}
      />
    </>
  );
}
