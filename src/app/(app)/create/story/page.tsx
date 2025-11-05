'use client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageIcon, UploadCloud } from "lucide-react";

export default function CreateStoryPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <ImageIcon className="w-6 h-6" /> Create a Story
          </CardTitle>
          <CardDescription>Share a photo or a short video that will disappear after 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload-story">File</Label>
            <div className="flex items-center justify-center w-full">
                <Label htmlFor="file-upload-story" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-muted-foreground">Image or short video</p>
                    </div>
                    <Input id="file-upload-story" type="file" className="hidden" />
                </Label>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full font-headline">Post to Story</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
