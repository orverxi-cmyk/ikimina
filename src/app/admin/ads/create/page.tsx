'use client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DollarSign, UploadCloud } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

export default function CreateAdCampaignPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-6 h-6" /> Create New Ad Campaign
          </CardTitle>
          <CardDescription>Fill out the details below to launch your campaign.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input id="campaign-name" placeholder="e.g., Summer Album Promotion" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input id="budget" type="number" placeholder="500.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Campaign Objective</Label>
              <Select>
                <SelectTrigger id="objective">
                  <SelectValue placeholder="Select an objective" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reach">Reach</SelectItem>
                  <SelectItem value="clicks">Website Clicks</SelectItem>
                  <SelectItem value="conversions">Conversions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ad Creative</Label>
            <div className="flex items-center justify-center w-full">
                <Label htmlFor="ad-creative-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-muted-foreground">Image or Video (MP4, PNG, JPG)</p>
                    </div>
                    <Input id="ad-creative-upload" type="file" className="hidden" />
                </Label>
            </div> 
          </div>
          <div className="space-y-2">
            <Label htmlFor="headline">Headline</Label>
            <Input id="headline" placeholder="Your catchy ad headline..." />
          </div>
           <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Describe your ad..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-link">Call to Action Link</Label>
            <Input id="cta-link" placeholder="https://your-website.com" />
          </div>
        </CardContent>
        <CardFooter className="justify-end space-x-2">
            <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button>Launch Campaign</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
