'use client';
import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share, Music, Video } from 'lucide-react';

export function Feed() {
  // In a real app, this would be a list of videos and we'd use a library like Swiper.js

  return (
    <div className="relative h-full max-h-screen flex items-center justify-center py-4 md:py-8">
        {/* Centered Feed on Desktop */}
        <div className="relative w-full max-w-[360px] h-full max-h-[80vh] md:max-h-[calc(100vh-80px)] bg-card rounded-2xl overflow-hidden shadow-2xl shadow-primary/10">
            <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center text-center p-8">
                <Video className="w-24 h-24 text-muted-foreground/50 mb-4" />
                <h2 className="text-2xl font-bold font-headline mb-2">Nothing to see here... yet!</h2>
                <p className="text-muted-foreground mb-4">Follow creators or upload your own content to get started.</p>
                <Button>Find Creators</Button>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white z-20">
                <div className="flex items-center gap-2 mb-2">
                    <Avatar>
                        <AvatarFallback>??</AvatarFallback>
                    </Avatar>
                    <p className="font-bold font-headline">@username</p>
                </div>
                <p className="mb-2 text-sm">Your feed is empty. Follow some creators!</p>
                <div className="flex items-center gap-2 text-sm">
                    <Music className="h-4 w-4" />
                    <p>No sound</p>
                </div>
            </div>

            <div className="absolute bottom-24 right-2 flex flex-col gap-4 z-20">
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12" disabled>
                        <Heart className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">0</span>
                </div>
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12" disabled>
                        <MessageCircle className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">0</span>
                </div>
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12" disabled>
                        <Share className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">0</span>
                </div>
            </div>

             <div className="absolute top-4 left-0 right-0 flex justify-center gap-4 z-20">
                <button className="text-white/70 font-semibold text-lg font-headline">Following</button>
                <button className="text-white font-bold text-lg relative font-headline after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:right-0 after:h-[2px] after:bg-primary">For You</button>
                <button className="text-white/70 font-semibold text-lg font-headline">Popular</button>
            </div>
        </div>
    </div>
  );
}
