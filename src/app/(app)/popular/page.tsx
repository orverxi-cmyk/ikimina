import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Play } from 'lucide-react';

export default function PopularPage() {
  const gridImages = PlaceHolderImages.filter(p => p.id.startsWith('grid-item'));

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-headline text-4xl font-bold mb-8">Popular on LopRok</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...gridImages, ...gridImages, ...gridImages].map((img, index) => (
          img && <div key={index} className="group relative aspect-[3/4] overflow-hidden rounded-lg shadow-md">
            <Image
              src={img.imageUrl.replace('/400/400', '/300/400')}
              alt={img.description}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              data-ai-hint={img.imageHint}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Play className="h-12 w-12 text-white fill-white drop-shadow-lg" />
            </div>
            <div className="absolute bottom-0 left-0 p-3 text-white">
                <p className="font-semibold truncate">Song Title {index + 1}</p>
                <p className="text-sm text-white/80 truncate">@artist{index+1}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
