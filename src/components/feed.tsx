'use client';
import React from 'react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share, Music } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const video = {
    id: '1',
    user: {
        name: 'DJ Rok',
        avatarUrl: PlaceHolderImages.find(p => p.id === 'avatar-1')?.imageUrl ?? '',
    },
    videoUrl: PlaceHolderImages.find(p => p.id === 'feed-1')?.imageUrl ?? '',
    caption: 'New beat drop! 🔥 #music #producer',
    song: 'Original Sound',
    likes: '1.2M',
    comments: '4,532',
    shares: '23.1K',
};

export function Feed() {
  // In a real app, this would be a list of videos and we'd use a library like Swiper.js

  return (
    <div className="relative h-full max-h-screen flex items-center justify-center py-4 md:py-8">
        {/* Centered Feed on Desktop */}
        <div className="relative w-full max-w-[360px] h-full max-h-[80vh] md:max-h-[calc(100vh-80px)] bg-card rounded-2xl overflow-hidden shadow-2xl shadow-primary/10">
            <Image
                src={video.videoUrl}
                alt="Video feed content"
                fill
                className="z-0 object-cover"
                data-ai-hint="concert dj"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white z-20">
                <div className="flex items-center gap-2 mb-2">
                    <Avatar>
                        <AvatarImage src={video.user.avatarUrl} alt={video.user.name} data-ai-hint="person portrait"/>
                        <AvatarFallback>DR</AvatarFallback>
                    </Avatar>
                    <p className="font-bold font-headline">@{video.user.name}</p>
                    <Button variant="outline" size="sm" className="ml-2 bg-transparent border-white text-white hover:bg-white hover:text-black">Follow</Button>
                </div>
                <p className="mb-2 text-sm">{video.caption}</p>
                <div className="flex items-center gap-2 text-sm">
                    <Music className="h-4 w-4" />
                    <p>{video.song}</p>
                </div>
            </div>

            <div className="absolute bottom-24 right-2 flex flex-col gap-4 z-20">
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12">
                        <Heart className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">{video.likes}</span>
                </div>
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12">
                        <MessageCircle className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">{video.comments}</span>
                </div>
                <div className="flex flex-col items-center">
                    <Button variant="ghost" size="icon" className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white h-12 w-12">
                        <Share className="h-7 w-7" />
                    </Button>
                    <span className="text-white text-sm font-bold">{video.shares}</span>
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
