import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send } from "lucide-react";

const conversations = [
  { name: 'Melody Maker', message: 'Sounds good, let\'s do it!', avatar: 'https://picsum.photos/seed/msg1/100/100', online: true },
  { name: 'BeatMaster B', message: 'Can you send over the stems?', avatar: 'https://picsum.photos/seed/msg2/100/100', online: false },
  { name: 'RhythmQueen', message: 'Loved your last track!', avatar: 'https://picsum.photos/seed/msg3/100/100', online: true },
  { name: 'VocalVibes', message: 'I have an idea for the chorus', avatar: 'https://picsum.photos/seed/msg4/100/100', online: false },
  { name: 'SynthGod', message: 'Yeah I\'m free next week', avatar: 'https://picsum.photos/seed/msg5/100/100', online: true },
  { name: 'LoopLegend', message: 'Check your email', avatar: 'https://picsum.photos/seed/msg6/100/100', online: false },
];

export default function MessagesPage() {
  return (
    <div className="h-full max-h-screen flex flex-col md:flex-row overflow-hidden">
      {/* Conversation List */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-headline text-2xl font-bold">Messages</h2>
          <div className="relative mt-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search" className="pl-8" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {conversations.map(convo => (
            <div key={convo.name} className="flex items-center gap-3 p-4 hover:bg-accent cursor-pointer border-b border-border/50">
              <Avatar className="relative">
                <AvatarImage src={convo.avatar} />
                <AvatarFallback>{convo.name.charAt(0)}</AvatarFallback>
                {convo.online && <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card" />}
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="font-semibold truncate">{convo.name}</p>
                <p className="text-sm text-muted-foreground truncate">{convo.message}</p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Window */}
      <div className="hidden md:flex flex-1 flex-col h-full">
        <div className="p-4 border-b flex items-center gap-3 bg-card">
          <Avatar>
            <AvatarImage src="https://picsum.photos/seed/msg1/100/100" />
            <AvatarFallback>MM</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold font-headline">Melody Maker</p>
            <p className="text-sm text-green-400">Online</p>
          </div>
        </div>
        <ScrollArea className="flex-1 p-6 space-y-4 bg-background">
          {/* Messages */}
          <div className="flex justify-start"><div className="bg-muted p-3 rounded-lg max-w-xs">Hey, I heard your new instrumental, it's sick!</div></div>
          <div className="flex justify-end"><div className="bg-primary text-primary-foreground p-3 rounded-lg max-w-xs">Thanks man! Really appreciate that.</div></div>
          <div className="flex justify-start"><div className="bg-muted p-3 rounded-lg max-w-xs">I was thinking of laying down some vocals on it. You down for a collab?</div></div>
          <div className="flex justify-end"><div className="bg-primary text-primary-foreground p-3 rounded-lg max-w-xs">For sure! Sounds good, let's do it!</div></div>
        </ScrollArea>
        <div className="p-4 border-t bg-card">
          <div className="relative">
            <Input placeholder="Type a message..." className="pr-12" />
            <Button size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
