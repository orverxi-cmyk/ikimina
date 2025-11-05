import { Button } from '@/components/ui/button';
import { Slider } from '@/components.../ui/slider';
import { Mic, Video, Music, FlipHorizontal, Timer, X } from 'lucide-react';
import Link from 'next/link';

export default function RecordPage() {
  return (
    <div className="fixed inset-0 bg-black text-white z-50 flex items-center justify-center">
      <div className="relative w-full max-w-lg aspect-[9/16] bg-gray-900 rounded-2xl overflow-hidden flex flex-col justify-between shadow-2xl shadow-primary/20">
        {/* Mock camera preview */}
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <Video className="w-24 h-24 text-gray-700" />
        </div>

        {/* Header controls */}
        <div className="relative z-10 flex justify-between p-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="bg-black/30 rounded-full text-white">
              <X className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="bg-black/30 rounded-full text-white"><FlipHorizontal className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" className="bg-black/30 rounded-full text-white"><Timer className="w-5 h-5" /></Button>
          </div>
        </div>

        {/* Footer controls */}
        <div className="relative z-10 p-4 space-y-4">
           <div className="bg-black/30 p-2 rounded-lg">
             <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-primary" />
                <p className="text-sm font-semibold">Instrumental: Lo-Fi Chill Beat</p>
             </div>
            <Slider defaultValue={[50]} max={100} step={1} className="mt-2" />
          </div>
          <div className="flex justify-center items-center gap-8">
            <Button variant="ghost" className="flex flex-col h-auto text-white">
              <div className="bg-black/30 p-3 rounded-full">
                <Music className="w-6 h-6" />
              </div>
              <span className="text-xs mt-1">Sounds</span>
            </Button>
            <Button size="icon" className="w-20 h-20 rounded-full border-4 border-white bg-primary hover:bg-primary/90">
              <Mic className="w-8 h-8" />
            </Button>
            <Button variant="ghost" className="flex flex-col h-auto text-white">
              <div className="bg-black/30 p-3 rounded-full">
                <span className="text-lg font-bold">1x</span>
              </div>
              <span className="text-xs mt-1">Speed</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
