'use client';
import { User, Settings, Play } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageIcon } from 'lucide-react';

function ContentGrid() {
  return (
    <div className="flex items-center justify-center h-64 border-t">
      <div className="text-center text-muted-foreground">
        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
        <p>No creations yet.</p>
      </div>
    </div>
  );
}

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { username } = params;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card className="border-none bg-transparent md:bg-card md:border">
        <CardContent className="p-0">
          <div className="relative h-48 md:h-64 w-full bg-muted md:rounded-t-lg">
            <div className="absolute -bottom-12 left-6">
              <Avatar className="w-24 h-24 border-4 border-card">
                <AvatarFallback className="text-3xl"><User /></AvatarFallback>
              </Avatar>
            </div>
          </div>
          
          <div className="pt-16 px-6 pb-6">
            <div className="flex justify-end">
                {username === 'me' ? (
                     <Button variant="outline"><Settings className="w-4 h-4 mr-2" />Edit Profile</Button>
                ) : (
                    <Button>Follow</Button>
                )}
            </div>

            <h2 className="font-headline text-3xl font-bold">@{username}</h2>
            <p className="text-muted-foreground mt-1 text-lg"></p>
            <p className="mt-4 max-w-prose"></p>

            <div className="flex gap-6 mt-6">
                <div><span className="font-bold">0</span> <span className="text-muted-foreground">Following</span></div>
                <div><span className="font-bold">0</span> <span className="text-muted-foreground">Followers</span></div>
                <div><span className="font-bold">0</span> <span className="text-muted-foreground">Likes</span></div>
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
                 <div className="flex items-center justify-center h-64 border-t">
                    <div className="text-center text-muted-foreground">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                        <p>No liked content yet.</p>
                    </div>
                </div>
            </TabsContent>
            <TabsContent value="reposts">
                 <div className="flex items-center justify-center h-64 border-t">
                    <div className="text-center text-muted-foreground">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                        <p>No reposts yet.</p>
                    </div>
                </div>
            </TabsContent>
          </Tabs>

        </CardContent>
      </Card>
    </div>
  );
}
