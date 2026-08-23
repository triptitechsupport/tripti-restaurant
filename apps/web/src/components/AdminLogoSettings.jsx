import React, { useEffect, useState, useRef } from 'react';
import { Image as ImageIcon, Upload, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';

export default function AdminLogoSettings() {
  const [record, setRecord] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchBranding = async () => {
    setIsLoading(true);
    try {
      const list = await pb.collection('site_branding').getList(1, 1, { $autoCancel: false });
      if (list.items.length > 0) {
        const rec = list.items[0];
        setRecord(rec);
        setLogoUrl(rec.logo ? pb.files.getURL(rec, rec.logo) : null);
      } else {
        setRecord(null);
        setLogoUrl(null);
      }
    } catch (err) {
      console.error('Failed to load site branding', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);

      let updated;
      if (record) {
        updated = await pb.collection('site_branding').update(record.id, formData, { $autoCancel: false });
      } else {
        updated = await pb.collection('site_branding').create(formData, { $autoCancel: false });
      }
      setRecord(updated);
      setLogoUrl(updated.logo ? pb.files.getURL(updated, updated.logo) : null);
      toast.success('Logo updated successfully');
    } catch (err) {
      console.error('Failed to upload logo', err);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!record) return;
    setIsUploading(true);
    try {
      const updated = await pb.collection('site_branding').update(record.id, { logo: null }, { $autoCancel: false });
      setRecord(updated);
      setLogoUrl(null);
      toast.success('Logo removed');
    } catch (err) {
      console.error('Failed to remove logo', err);
      toast.error('Failed to remove logo');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b-2 border-border">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="font-serif text-primary text-xl">Header Logo</CardTitle>
            <CardDescription className="font-medium text-foreground">
              Upload a logo to replace the text branding in the navigation header.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="h-20 w-40 rounded-xl border-2 border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Current logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground font-medium px-2 text-center">No logo uploaded</span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                onChange={handleFileChange}
                className="hidden"
                id="logo-upload-input"
              />
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="shadow-sm"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </Button>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemove}
                    disabled={isUploading}
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Recommended: transparent PNG or SVG, at least 200px tall.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
