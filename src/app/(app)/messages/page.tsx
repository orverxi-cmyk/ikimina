import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, MessageSquare } from "lucide-react";

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
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4" />
            <p>No conversations yet.</p>
          </div>
        </ScrollArea>
      </div>

      {/* Chat Window */}
      <div className="hidden md:flex flex-1 flex-col h-full">
        <div className="p-4 border-b flex items-center gap-3 bg-card h-[81px]">
          {/* Empty header */}
        </div>
        <div className="flex-1 flex items-center justify-center bg-background p-6 text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Select a conversation</h3>
            <p>Choose from your existing conversations to start chatting.</p>
          </div>
        </div>
        <div className="p-4 border-t bg-card">
          <div className="relative">
            <Input placeholder="Type a message..." className="pr-12" disabled />
            <Button size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
