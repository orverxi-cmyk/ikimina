'use client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UploadCloud, Video } from "lucide-react";
import { useRouter } from 'next/navigation';

export default function CreateTeelPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Video className="w-6 h-6" /> Create a Teel
          </CardTitle>
          <CardDescription>Share a short video or photo with your followers. Upload a file and add a title and description.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload-teel">File</Label>
            <div className="flex items-center justify-center w-full">
                <Label htmlFor="file-upload-teel" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-muted-foreground">MP4, MOV, JPG, PNG</p>
                    </div>
                    <Input id="file-upload-teel" type="file" className="hidden" />
                </Label>
            </div> 
          </div>
          <div className="space-y-2">
            <Label htmlFor="title-teel">Title</Label>
            <Input id="title-teel" placeholder="Enter a title for your teel..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description-teel">Description</Label>
            <Textarea id="description-teel" placeholder="Tell us more about your teel..." />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full font-headline">Create Teel</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
