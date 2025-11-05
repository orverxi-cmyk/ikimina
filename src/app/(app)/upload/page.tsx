'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRouter } from 'next/navigation';
import {
  Video,
  Music,
  ImageIcon,
  MicVocal,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default function UploadPage() {
  const router = useRouter();

  const options = [
    {
      href: '/create',
      label: 'Upload a Teel',
      description: 'Share a short video or photo.',
      icon: Video,
    },
    {
      href: '/create/instrumental',
      label: 'Upload an Instrumental',
      description: 'Share a beat for others to use.',
      icon: Music,
    },
    {
      href: '/create/story',
      label: 'Create a Story',
      description: 'Share a photo or video for 24 hours.',
      icon: ImageIcon,
    },
    {
      href: '/record',
      label: 'Record Vocals',
      description: 'Record audio over an instrumental.',
      icon: MicVocal,
    },
  ];

  return (
    <Sheet defaultOpen onOpenChange={() => router.back()}>
      <SheetContent side="bottom" className="rounded-t-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="font-headline text-2xl">
            Create
          </SheetTitle>
          <SheetDescription>
            What would you like to share with the world?
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-2">
          {options.map((option) => (
            <Link
              href={option.href}
              key={option.href}
              className="flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-accent"
            >
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <option.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{option.label}</p>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
