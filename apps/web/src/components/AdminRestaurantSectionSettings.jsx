import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Save, Eye, EyeOff, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import pb from '@/lib/pocketbaseClient.js';

export default function AdminRestaurantSectionSettings() {
  const [record, setRecord] = useState(null);
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionDe, setDescriptionDe] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const fileRef = useRef();

  const DEFAULT_EN = "Welcome to Tripti Genusswelt, where every dish tells a story of India's rich culinary heritage. Our chefs bring authentic flavors using traditional recipes and freshly sourced spices. From the vibrant streets of Mumbai to the royal kitchens of Rajasthan, every meal is a journey through the diverse cuisines of India. We invite you to sit, relax, and savor the warmth of our hospitality alongside the finest Indian cuisine in Villach.";
  const DEFAULT_DE = "Willkommen bei Tripti Genusswelt, wo jedes Gericht eine Geschichte von Indiens reichem kulinarischen Erbe erzählt. Unsere Köche bringen authentische Aromen mit traditionellen Rezepten und frisch bezogenen Gewürzen. Von den lebhaften Straßen Mumbais bis zu den königlichen Küchen Rajasthans ist jede Mahlzeit eine Reise durch die vielfältige Küche Indiens. Wir laden Sie ein, sich zu setzen, zu entspannen und die Wärme unserer Gastfreundschaft zu genießen.";

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const list = await pb.collection('restaurant_section').getList(1, 1);
      if (list.items.length > 0) {
        const rec = list.items[0];
        setRecord(rec);
        // Support legacy single description field migration
        setDescriptionEn(rec.description_en || rec.description || DEFAULT_EN);
        setDescriptionDe(rec.description_de || DEFAULT_DE);
        setEnabled(rec.enabled !== false);
      } else {
        setEnabled(true);
        setDescriptionEn(DEFAULT_EN);
        setDescriptionDe(DEFAULT_DE);
      }
    } catch (e) {
      console.error('[RestaurantSection] load error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMediaFile(file);
    setRemoveMedia(false);
    const url = URL.createObjectURL(file);
    setMediaPreview({ url, type: file.type });
  };

  const handleRemove = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setRemoveMedia(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('description_en', descriptionEn);
      fd.append('description_de', descriptionDe);
      fd.append('enabled', enabled ? 'true' : 'false');
      if (mediaFile) {
        fd.append('media', mediaFile);
      } else if (removeMedia) {
        fd.append('media', '');
      }

      if (record) {
        const updated = await pb.collection('restaurant_section').update(record.id, fd);
        setRecord(updated);
        setMediaFile(null);
        setRemoveMedia(false);
      } else {
        const created = await pb.collection('restaurant_section').create(fd);
        setRecord(created);
        setMediaFile(null);
        setRemoveMedia(false);
      }
      alert('Saved successfully!');
    } catch (e) {
      console.error('[RestaurantSection] save error', e);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const currentMediaUrl = record?.media && !removeMedia
    ? pb.files.getURL(record, record.media)
    : null;

  const previewUrl = mediaPreview?.url || currentMediaUrl;
  const previewType = mediaPreview?.type || (record?.media
    ? (record.media.endsWith('.mp4') || record.media.endsWith('.webm') || record.media.endsWith('.ogg') ? 'video/mp4' : 'image/jpeg')
    : null);

  return (
    <div className="bg-card border-2 border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif font-bold text-primary flex items-center gap-2">
          <Image className="h-5 w-5" />
          Our Restaurant Section
        </h3>
        <div className="flex items-center gap-2">
          {enabled ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <Label htmlFor="restaurant-section-enabled" className="text-sm font-medium">
            {enabled ? 'Visible' : 'Hidden'}
          </Label>
          <Switch
            id="restaurant-section-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      ) : (
        <>
          {/* Media Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">Photo</Label>
            <p className="text-xs text-muted-foreground">Upload an image (JPG, PNG, WebP, GIF). Max 50MB.</p>

            {previewUrl && (
              <div className="relative rounded-xl overflow-hidden border-2 border-border bg-muted max-h-64 flex items-center justify-center">
                <img src={previewUrl} alt="Restaurant section media" className="max-h-64 w-full object-cover" />
                <button
                  onClick={handleRemove}
                  className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:bg-destructive/80 transition-colors"
                  title="Remove image"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
                id="restaurant-media-upload"
              />
              <label htmlFor="restaurant-media-upload">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    {previewUrl ? 'Replace Image' : 'Upload Image'}
                  </span>
                </Button>
              </label>
            </div>
          </div>

          {/* English Description */}
          <div className="space-y-2">
            <Label htmlFor="restaurant-description-en" className="text-sm font-semibold text-foreground flex items-center gap-2">
              Description — English (EN)
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">EN</span>
            </Label>
            <Textarea
              id="restaurant-description-en"
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              rows={5}
              placeholder="Write the English description about your restaurant..."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{descriptionEn.length} characters</p>
          </div>

          {/* German Description */}
          <div className="space-y-2">
            <Label htmlFor="restaurant-description-de" className="text-sm font-semibold text-foreground flex items-center gap-2">
              Beschreibung — Deutsch (DE)
              <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-bold">DE</span>
            </Label>
            <Textarea
              id="restaurant-description-de"
              value={descriptionDe}
              onChange={(e) => setDescriptionDe(e.target.value)}
              rows={5}
              placeholder="Schreiben Sie die deutsche Beschreibung Ihres Restaurants..."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{descriptionDe.length} characters</p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
          </Button>
        </>
      )}
    </div>
  );
}
