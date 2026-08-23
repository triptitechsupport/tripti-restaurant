import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Loader2, ExternalLink, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const PDF_LANGS = [
  { key: 'pdfMenuDE', label: 'German Menu (PDF)' },
  { key: 'pdfMenuEN', label: 'English Menu (PDF)' },
];

const IMAGE_LANGS = [
  { key: 'menuImageDE', label: 'German Menu (Image)' },
  { key: 'menuImageEN', label: 'English Menu (Image)' },
];

export default function PdfMenuSettings() {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const fileInputRefs = useRef({});

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const results = await pb.collection('pdf_menu_settings').getList(1, 1, { $autoCancel: false });
      if (results.items.length > 0) {
        setRecord(results.items[0]);
      } else {
        const created = await pb.collection('pdf_menu_settings').create({ pdfMenuEnabled: true }, { $autoCancel: false });
        setRecord(created);
      }
    } catch (err) {
      console.error('[PdfMenuSettings] Failed to load settings:', err);
      toast.error('Failed to load PDF menu settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTogglePdf = async (checked) => {
    if (!record) return;
    try {
      const updated = await pb.collection('pdf_menu_settings').update(record.id, { pdfMenuEnabled: checked }, { $autoCancel: false });
      setRecord(updated);
      toast.success(`PDF menu display ${checked ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('[PdfMenuSettings] Failed to toggle:', err);
      toast.error('Failed to update PDF menu setting.');
    }
  };

  const handleToggleImages = async (checked) => {
    if (!record) return;
    try {
      const updated = await pb.collection('pdf_menu_settings').update(record.id, { imageMenuEnabled: checked }, { $autoCancel: false });
      setRecord(updated);
      toast.success(`Menu image display ${checked ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('[PdfMenuSettings] Failed to toggle images:', err);
      toast.error('Failed to update menu image setting.');
    }
  };

  const handleFileSelect = async (fieldKey, file, isImage) => {
    if (!record || !file) return;
    if (!isImage && file.type !== 'application/pdf') {
      toast.error('Please select a valid PDF file.');
      return;
    }
    if (isImage && !file.type.startsWith('image/')) {
      toast.error('Please select a valid image file.');
      return;
    }
    setUploading(fieldKey);
    try {
      const formData = new FormData();
      formData.append(fieldKey, file);
      const updated = await pb.collection('pdf_menu_settings').update(record.id, formData, { $autoCancel: false });
      setRecord(updated);
      toast.success(isImage ? 'Menu image uploaded successfully.' : 'PDF uploaded successfully.');
    } catch (err) {
      console.error('[PdfMenuSettings] Failed to upload file:', err);
      toast.error('Failed to upload file.');
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (fieldKey) => {
    if (!record) return;
    setUploading(fieldKey);
    try {
      const updated = await pb.collection('pdf_menu_settings').update(record.id, { [fieldKey]: null }, { $autoCancel: false });
      setRecord(updated);
      toast.success('File removed.');
    } catch (err) {
      console.error('[PdfMenuSettings] Failed to remove file:', err);
      toast.error('Failed to remove file.');
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading menu settings...
      </div>
    );
  }

  const renderFileGrid = (items, isImage) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {items.map(({ key, label }) => {
        const fileName = record?.[key];
        const fileUrl = fileName ? pb.files.getURL(record, fileName) : null;
        const isBusy = uploading === key;

        return (
          <div key={key} className="border-2 border-border rounded-xl p-5 bg-background/60">
            <h3 className="font-serif font-bold text-primary text-base mb-3">{label}</h3>

            {fileUrl ? (
              <div className="space-y-3">
                {isImage ? (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border">
                    <img src={fileUrl} alt={label} className="w-full h-40 object-cover" />
                  </a>
                ) : (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-secondary transition-colors underline"
                  >
                    <ExternalLink className="h-4 w-4" /> View current PDF
                  </a>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isBusy}
                    onClick={() => fileInputRefs.current[key]?.click()}
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Replace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 border-destructive/20"
                    disabled={isBusy}
                    onClick={() => handleRemove(key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                disabled={isBusy}
                onClick={() => fileInputRefs.current[key]?.click()}
              >
                {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {isImage ? 'Upload Image' : 'Upload PDF'}
              </Button>
            )}

            <input
              ref={(el) => (fileInputRefs.current[key] = el)}
              type="file"
              accept={isImage ? 'image/*' : 'application/pdf'}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleFileSelect(key, file, isImage);
                e.target.value = '';
              }}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-card border-2 border-border rounded-2xl p-mobile shadow-md">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-3">
          <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">Menu Files Management</h2>
        </div>
        <p className="text-muted-foreground font-medium text-sm">
          Upload PDF and image versions of your menu, and control what visitors see on the menu page.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 md:mb-8">
        <div className="flex items-start gap-5 p-mobile border-2 border-border rounded-xl bg-accent/20">
          <Switch
            checked={!!record?.pdfMenuEnabled}
            onCheckedChange={handleTogglePdf}
            className="mt-1 data-[state=checked]:bg-primary"
          />
          <div>
            <label className="text-lg font-serif font-bold text-primary block mb-1">Show PDF Menu</label>
            <p className="text-sm font-medium text-foreground">
              Display downloadable PDF menu buttons on the menu page.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-5 p-mobile border-2 border-border rounded-xl bg-accent/20">
          <Switch
            checked={!!record?.imageMenuEnabled}
            onCheckedChange={handleToggleImages}
            className="mt-1 data-[state=checked]:bg-primary"
          />
          <div>
            <label className="text-lg font-serif font-bold text-primary block mb-1">Show Menu Images</label>
            <p className="text-sm font-medium text-foreground">
              Display uploaded menu images directly on the menu page.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 md:mb-8">
        <h3 className="flex items-center gap-2 font-serif font-bold text-primary text-lg mb-4">
          <FileText className="h-5 w-5" /> PDF Menus
        </h3>
        {renderFileGrid(PDF_LANGS, false)}
      </div>

      <div>
        <h3 className="flex items-center gap-2 font-serif font-bold text-primary text-lg mb-4">
          <ImageIcon className="h-5 w-5" /> Menu Images
        </h3>
        {renderFileGrid(IMAGE_LANGS, true)}
      </div>
    </div>
  );
}
