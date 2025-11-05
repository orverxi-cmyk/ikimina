import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UploadCloud, Music, Video, Image as ImageIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface UploadFormProps {
    title: string;
    description: string;
    icon: LucideIcon;
    fileType: string;
    children?: React.ReactNode;
}

function UploadForm({ title, description, icon: Icon, fileType, children }: UploadFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
          <Icon className="w-6 h-6" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`file-upload-${title}`}>File</Label>
          <div className="flex items-center justify-center w-full">
              <Label htmlFor={`file-upload-${title}`} className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-muted-foreground">{fileType}</p>
                  </div>
                  <Input id={`file-upload-${title}`} type="file" className="hidden" />
              </Label>
          </div> 
        </div>
        <div className="space-y-2">
          <Label htmlFor={`title-${title}`}>Title</Label>
          <Input id={`title-${title}`} placeholder="Enter a title..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`description-${title}`}>Description</Label>
          <Textarea id={`description-${title}`} placeholder="Tell us more about your upload..." />
        </div>
        {children}
      </CardContent>
      <CardFooter>
        <Button className="w-full font-headline">Upload</Button>
      </CardFooter>
    </Card>
  );
}

export default function CreatePage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="font-headline text-3xl font-bold mb-8">Create</h1>
      <Tabs defaultValue="teel" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="teel">Teel</TabsTrigger>
          <TabsTrigger value="instrumental">Instrumental</TabsTrigger>
          <TabsTrigger value="story">Story</TabsTrigger>
        </TabsList>
        <TabsContent value="teel" className="mt-6">
          <UploadForm title="Upload a Teel" description="Share a short video or photo with your followers." icon={Video} fileType="MP4, MOV, JPG, PNG" />
        </TabsContent>
        <TabsContent value="instrumental" className="mt-6">
          <UploadForm title="Upload an Instrumental" description="Upload a beat for others to record vocals over." icon={Music} fileType="MP3, WAV" />
        </TabsContent>
        <TabsContent value="story" className="mt-6">
          <UploadForm title="Upload a Story" description="Stories are visible for 24 hours." icon={ImageIcon} fileType="JPG, PNG, MP4" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
