import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileFormField from '@/components/MobileFormField.jsx';

const CATEGORIES = [
  'Breakfast', 'Appetizers', 'Main Courses', 'Sides & Accompaniments', 
  'Snacks', 'Desserts', 'Beverages', 'Kids Menu'
];

const ALLERGENS_LIST = [
  { id: 'A', label: 'Cereals containing gluten' },
  { id: 'B', label: 'Crustaceans' },
  { id: 'C', label: 'Eggs' },
  { id: 'D', label: 'Fish' },
  { id: 'E', label: 'Peanuts' },
  { id: 'F', label: 'Soja' },
  { id: 'G', label: 'Milk and/or lactose' },
  { id: 'H', label: 'Nuts' },
  { id: 'L', label: 'Celery' },
  { id: 'M', label: 'Mustard' },
  { id: 'N', label: 'Sesame seed' },
  { id: 'O', label: 'Sulphur dioxide and sulphites' },
  { id: 'P', label: 'Lupins' },
  { id: 'R', label: 'Molluscs' }
];

export default function MenuItemForm({ initialData, onSuccess, onCancel }) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    nameEN: '',
    nameDE: '',
    descriptionEN: '',
    descriptionDE: '',
    allergens: [],
    price: '',
    category: '',
    availability: true,
    isVegetarian: false,
  });
  const [imageFile, setImageFile] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        nameEN: initialData.nameEN || initialData.name || '',
        nameDE: initialData.nameDE || '',
        descriptionEN: initialData.descriptionEN || initialData.description || '',
        descriptionDE: initialData.descriptionDE || '',
        allergens: initialData.allergens || [],
        price: initialData.price?.toString() || '',
        category: initialData.category || '',
        availability: initialData.availability ?? true,
        isVegetarian: initialData.isVegetarian ?? false,
      });
      setImageFile(null);
      setErrors({});
    } else {
      setFormData({
        nameEN: '', nameDE: '', descriptionEN: '', descriptionDE: '', allergens: [],
        price: '', category: '', availability: true, isVegetarian: false,
      });
      setImageFile(null);
      setErrors({});
    }
  }, [initialData]);

  const validate = () => {
    const newErrors = {};
    if (!formData.nameEN.trim()) newErrors.nameEN = 'English name is required';
    if (!formData.nameDE.trim()) newErrors.nameDE = 'German name is required';
    if (!formData.price || isNaN(formData.price) || parseFloat(formData.price) < 0) newErrors.price = 'Valid price is required (min 0)';
    if (!formData.category) newErrors.category = 'Category is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAllergenToggle = (allergenId) => {
    setFormData(prev => {
      const current = prev.allergens || [];
      if (current.includes(allergenId)) {
        return { ...prev, allergens: current.filter(id => id !== allergenId) };
      } else {
        return { ...prev, allergens: [...current, allergenId] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    setIsLoading(true);
    try {
      const submitData = new FormData();
      submitData.append('nameEN', formData.nameEN.trim());
      submitData.append('nameDE', formData.nameDE.trim());
      // Backwards compatibility mapping for old code
      submitData.append('name', formData.nameEN.trim());
      
      submitData.append('descriptionEN', formData.descriptionEN.trim());
      submitData.append('descriptionDE', formData.descriptionDE.trim());
      // Backwards compatibility
      submitData.append('description', formData.descriptionEN.trim());

      submitData.append('price', parseFloat(formData.price));
      submitData.append('category', formData.category);
      submitData.append('availability', formData.availability);
      submitData.append('isVegetarian', formData.isVegetarian);
      
      // Handle array appending for PocketBase FormData (select MULTI)
      const allergensArr = formData.allergens || [];
      if (allergensArr.length === 0) {
        submitData.append('allergens', ''); // Ensure it clears out if empty
      } else {
        allergensArr.forEach(item => {
          submitData.append('allergens', item);
        });
      }
      
      if (imageFile) submitData.append('image', imageFile);

      if (initialData && initialData.id) {
        await pb.collection('menu_items').update(initialData.id, submitData, { $autoCancel: false });
        toast.success('Item updated successfully');
      } else {
        await pb.collection('menu_items').create(submitData, { $autoCancel: false });
        toast.success('Item created successfully');
      }
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'An error occurred while saving the item.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6 pb-6 md:pb-0">
      <div className="space-y-4 md:space-y-5">
        
        {/* Bilingual Names */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <MobileFormField label={<>Dish Name (English) <span className="text-destructive">*</span></>} id="menuItemNameEN" error={errors.nameEN}>
            <Input
              id="menuItemNameEN"
              placeholder="e.g., Butter Chicken"
              value={formData.nameEN}
              onChange={(e) => setFormData(prev => ({ ...prev, nameEN: e.target.value }))}
              className={errors.nameEN ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </MobileFormField>
          
          <MobileFormField label={<>Dish Name (German) <span className="text-destructive">*</span></>} id="menuItemNameDE" error={errors.nameDE}>
            <Input
              id="menuItemNameDE"
              placeholder="e.g., Butterhähnchen"
              value={formData.nameDE}
              onChange={(e) => setFormData(prev => ({ ...prev, nameDE: e.target.value }))}
              className={errors.nameDE ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </MobileFormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <MobileFormField label={<>Category <span className="text-destructive">*</span></>} id="menuItemCategory" error={errors.category}>
            <Select value={formData.category} onValueChange={(val) => setFormData(prev => ({ ...prev, category: val }))}>
              <SelectTrigger id="menuItemCategory" className={errors.category ? "border-destructive focus-visible:ring-destructive" : ""}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat} className="min-h-[44px]">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MobileFormField>

          <MobileFormField label={<>Price (€) <span className="text-destructive">*</span></>} id="menuItemPrice" error={errors.price}>
            <Input
              id="menuItemPrice"
              type="number"
              step="0.01" min="0" placeholder="0.00"
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              className={errors.price ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </MobileFormField>
        </div>

        {/* Bilingual Descriptions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <MobileFormField label="Description (English)" id="menuItemDescEN">
            <Textarea
              id="menuItemDescEN"
              rows={3}
              placeholder="Brief description in English..."
              value={formData.descriptionEN}
              onChange={(e) => setFormData(prev => ({ ...prev, descriptionEN: e.target.value }))}
              className="resize-none"
            />
          </MobileFormField>

          <MobileFormField label="Description (German)" id="menuItemDescDE">
            <Textarea
              id="menuItemDescDE"
              rows={3}
              placeholder="Kurze Beschreibung auf Deutsch..."
              value={formData.descriptionDE}
              onChange={(e) => setFormData(prev => ({ ...prev, descriptionDE: e.target.value }))}
              className="resize-none"
            />
          </MobileFormField>
        </div>

        {/* Allergen Management */}
        <MobileFormField label="Allergens" id="menuItemAllergens" description="Select all allergens present in this dish">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-muted/20 border border-border/50 rounded-xl">
            {ALLERGENS_LIST.map((allergen) => (
              <div key={allergen.id} className="flex items-start space-x-3">
                <Checkbox
                  id={`allergen-${allergen.id}`}
                  checked={(formData.allergens || []).includes(allergen.id)}
                  onCheckedChange={() => handleAllergenToggle(allergen.id)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-tight">
                  <Label 
                    htmlFor={`allergen-${allergen.id}`} 
                    className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    <span className="font-bold mr-1">{allergen.id} =</span>
                    {allergen.label}
                  </Label>
                </div>
              </div>
            ))}
          </div>
        </MobileFormField>

        <MobileFormField 
          label="Image" 
          id="menuItemImage" 
          description={initialData?.image ? "Current image will be kept if no new file is selected." : ""}
        >
          <Input
            id="menuItemImage"
            type="file"
            accept="image/*"
            onChange={(e) => { if (e.target.files?.length > 0) setImageFile(e.target.files[0]); }}
            className="cursor-pointer file:text-primary file:font-medium file:bg-primary/10 file:border-0 file:rounded-md file:mr-4 file:px-4 file:py-1 hover:file:bg-primary/20 pt-[9px]"
          />
        </MobileFormField>

        {/* Toggle Switches */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-2 pb-4 bg-muted/30 p-4 rounded-xl border border-border/50">
          <div className="flex items-start space-x-3 w-full">
            <Switch
              id="menuItemAvailability"
              checked={formData.availability}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, availability: checked }))}
              className="mt-1 shrink-0"
            />
            <div className="grid gap-1.5 leading-tight">
              <Label htmlFor="menuItemAvailability" className="cursor-pointer font-medium text-base">Availability</Label>
              <p className="text-sm text-muted-foreground">Active items are visible on the menu.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 w-full">
            <Switch
              id="menuItemVegetarian"
              checked={formData.isVegetarian}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isVegetarian: checked }))}
              className="mt-1 shrink-0"
            />
            <div className="grid gap-1.5 leading-tight">
              <Label htmlFor="menuItemVegetarian" className="cursor-pointer font-medium text-green-700 dark:text-green-500 text-base">Vegetarian</Label>
              <p className="text-sm text-muted-foreground">Mark this dish as vegetarian.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border/60">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} className="w-full sm:w-auto h-12 sm:h-11">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto min-w-[140px] h-12 sm:h-11 font-medium">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </div>
          ) : 'Save Item'}
        </Button>
      </div>
    </form>
  );
}