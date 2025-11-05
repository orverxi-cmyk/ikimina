'use client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Music, UploadCloud } from "lucide-react";

export default function CreateInstrumentalPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Music className="w-6 h-6" /> Upload an Instrumental
          </CardTitle>
          <CardDescription>Share your beat with the world for other artists to use.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload-instrumental">Audio File</Label>
            <div className="flex items-center justify-center w-full">
                <Label htmlFor="file-upload-instrumental" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-muted-foreground">MP3, WAV</p>
                    </div>
                    <Input id="file-upload-instrumental" type="file" className="hidden" />
                </Label>
            </div> 
          </div>
          <div className="space-y-2">
            <Label htmlFor="title-instrumental">Title</Label>
            <Input id="title-instrumental" placeholder="Enter a title for your instrumental..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre-instrumental">Genre</Label>
            <Input id="genre-instrumental" placeholder="e.g., Lo-fi, Trap, Hip Hop" />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full font-headline">Upload Instrumental</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
