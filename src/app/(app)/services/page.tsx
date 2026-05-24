'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, Leaf, Clock, Users, ChevronRight, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function ServicesPage() {
  const router = useRouter();

  const values = [
    {
      title: 'Expertise',
      description: 'With years of experience, we bring unmatched knowledge and skills to every project we undertake.',
      icon: ShieldCheck,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      title: 'Sustainability',
      description: 'Our solutions are designed to minimize environmental impact while promoting long-term benefits for communities.',
      icon: Leaf,
      color: 'text-green-600',
      bg: 'bg-green-50'
    },
    {
      title: 'Reliability',
      description: 'From timely service delivery to quality assurance, we are a partner you can count on.',
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    {
      title: 'Customer Focus',
      description: 'At SANEX, our customers are at the heart of everything we do. We strive to understand and exceed their expectations.',
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    }
  ];

  return (
    <div className="p-8 space-y-12 max-w-5xl mx-auto pb-24">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-headline font-bold">Why Choose Us</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          We are committed to creating meaningful impact and driving Rwanda towards a cleaner, healthier, and more sustainable future.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {values.map((v, i) => (
          <Card key={i} className="border-none shadow-md overflow-hidden hover:scale-[1.01] transition-transform">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className={`p-3 rounded-2xl ${v.bg}`}>
                <v.icon className={`h-6 w-6 ${v.color}`} />
              </div>
              <CardTitle className="text-xl">{v.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {v.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/10 bg-primary/5 rounded-3xl overflow-hidden border-2">
        <CardContent className="p-10 text-center space-y-6">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
             <Landmark className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold font-headline">Driving Innovation Together</h2>
          <p className="text-muted-foreground max-w-3xl mx-auto leading-relaxed italic">
            "As we continue to grow, we remain committed to creating meaningful impact and driving Rwanda towards a cleaner, healthier, and more sustainable future. Together, we can build a world where waste is no longer a problem but an opportunity for innovation and progress."
          </p>
          <div className="pt-4">
            <Button onClick={() => router.back()} variant="outline" className="rounded-xl px-8 h-12 font-bold">
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
