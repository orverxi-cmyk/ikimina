import Image from 'next/image';
import { User, Settings, Play } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';

function ContentGrid() {
  const gridImages = [
    PlaceHolderImages.find(p => p.id === 'grid-item-1'),
    PlaceHolderImages.find(p => p.id === 'grid-item-2'),
    PlaceHolderImages.find(p => p.id === 'grid-item-3'),
    PlaceHolderImages.find(p => p.id === 'grid-item-2'),
    PlaceHolderImages.find(p => p.id === 'grid-item-3'),
    PlaceHolderImages.find(p => p.id === 'grid-item-1'),
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
      {gridImages.map((img, index) => (
        img && <div key={index} className="aspect-square relative group overflow-hidden">
          <Image
            src={img.imageUrl}
            alt={img.description}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            data-ai-hint={img.imageHint}
          />
           <div className="absolute inset-0 bg-black/20" />
           <div className="absolute bottom-2 left-2 text-white flex items-center gap-1">
            <Play className="w-4 h-4 fill-white" />
            <span className="text-sm font-bold">1.2M</span>
           </div>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage({ params }: { params: { username: string } }) {
  const bannerImage = PlaceHolderImages.find(p => p.id === 'profile-banner-1');
  const avatarImage = PlaceHolderImages.find(p => p.id === 'avatar-2');

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card className="border-none bg-transparent md:bg-card md:border">
        <CardContent className="p-0">
          <div className="relative h-48 md:h-64 w-full">
            {bannerImage && <Image
              src={bannerImage.imageUrl}
              alt="Profile banner"
              fill
              className="object-cover md:rounded-t-lg"
              data-ai-hint={bannerImage.imageHint}
            />}
            <div className="absolute -bottom-12 left-6">
              <Avatar className="w-24 h-24 border-4 border-card">
                {avatarImage && <AvatarImage src={avatarImage.imageUrl} alt={params.username} data-ai-hint={avatarImage.imageHint}/>}
                <AvatarFallback className="text-3xl"><User /></AvatarFallback>
              </Avatar>
            </div>
          </div>
          
          <div className="pt-16 px-6 pb-6">
            <div className="flex justify-end">
                {params.username === 'me' ? (
                     <Button variant="outline"><Settings className="w-4 h-4 mr-2" />Edit Profile</Button>
                ) : (
                    <Button>Follow</Button>
                )}
            </div>

            <h2 className="font-headline text-3xl font-bold">@{params.username}</h2>
            <p className="text-muted-foreground mt-1 text-lg">Singer | Songwriter | Producer 🎵</p>
            <p className="mt-4 max-w-prose">Creating vibes and sharing with the world. Building a community of music lovers. DM for collabs. ✨</p>

            <div className="flex gap-6 mt-6">
                <div><span className="font-bold">1.2k</span> <span className="text-muted-foreground">Following</span></div>
                <div><span className="font-bold">5.8M</span> <span className="text-muted-foreground">Followers</span></div>
                <div><span className="font-bold">102.3M</span> <span className="text-muted-foreground">Likes</span></div>
            </div>
          </div>

          <Tabs defaultValue="creations" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-card/50 border-y rounded-none">
              <TabsTrigger value="creations" className="text-base">Creations</TabsTrigger>
              <TabsTrigger value="liked" className="text-base">Liked</TabsTrigger>
              <TabsTrigger value="reposts" className="text-base">Reposts</TabsTrigger>
            </TabsList>
            <TabsContent value="creations">
                <ContentGrid />
            </TabsContent>
            <TabsContent value="liked">
                <ContentGrid />
            </TabsContent>
            <TabsContent value="reposts">
                <ContentGrid />
            </TabsContent>
          </Tabs>

        </CardContent>
      </Card>
    </div>
  );
}
