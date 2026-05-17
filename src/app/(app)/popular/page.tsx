import { Flame } from 'lucide-react';

export default function PopularPage() {

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-headline text-4xl font-bold mb-8">Popular on Ikimina App</h1>
       <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg">
        <Flame className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Nothing is trending yet</h2>
        <p className="text-muted-foreground">Check back later to see community updates.</p>
      </div>
    </div>
  );
}
