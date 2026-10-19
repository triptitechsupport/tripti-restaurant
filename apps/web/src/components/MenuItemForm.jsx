import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileFormField from '@/components/MobileFormField.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

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
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [formData, setFormData] = useState({
    nameEN: '',
    nameDE: '',
    descriptionEN: '',
    descriptionDE: '',
    allergens: [],
    price: '',
    category: '',
    vat_Rate: 'REDUCED_1',
    availability: true,
    isVegetarian: false,
    prepMinutes: '',
    noticeHours: '',
    pickupBlocked: false,
  });
  const [imageFile, setImageFile] = useState(null);
  const [errors, setErrors] = useState({});
  // The category that arrived with the item. Radix Select used to fire an
  // empty onValueChange while options were still loading and wipe this, so
  // the dropdown showed "Select a category" and a save erased the value.
  const savedCategoryRef = useRef('');

  // Fetch dynamic categories from the `categories` collection (sorted by
  // display_order, then name). Falls back to a sensible default list if the
  // collection is empty or unreachable so the form always remains usable.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const records = await pb.collection('categories').getFullList({
          sort: 'display_order,name',
          $autoCancel: false,
        });
        if (!alive) return;
        setCategories(records.length > 0 ? records : []);
      } catch (err) {
        console.error('Failed to load categories:', err);
        if (alive) setCategories([]);
      } finally {
        if (alive) setCategoriesLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const readStoredCategory = (item) => {
    if (!item) return '';
    const raw = item.category ?? item.categoryId ?? item.category_id ?? '';
    if (Array.isArray(raw)) return String(raw[0] || '').trim();
    return String(raw).trim();
  };

  // Map a stored value (English name, German name, id, or legacy casing)
  // onto the canonical English category name the rest of the menu uses.
  // Unknown values are kept as-is so a save never blanks them.
  const resolveCategoryValue = (stored, list) => {
    const value = String(stored || '').trim();
    if (!value || !list?.length) return value;
    const needle = value.toLowerCase();
    const match = list.find((c) =>
      c.id === value
      || c.name === value
      || c.name_de === value
      || (c.name && c.name.toLowerCase() === needle)
      || (c.name_de && c.name_de.toLowerCase() === needle)
    );
    return match ? match.name : value;
  };

  // Fetch dynamic categories from the `categories` collection (sorted by
  // display_order, then name). Falls back to a sensible default list if the
  // collection is empty or unreachable so the form always remains usable.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const records = await pb.collection('categories').getFullList({
          sort: 'display_order,name',
          $autoCancel: false,
        });
        if (!alive) return;
        setCategories(records.length > 0 ? records : []);
      } catch (err) {
        console.error('Failed to load categories:', err);
        if (alive) setCategories([]);
      } finally {
        if (alive) setCategoriesLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const stored = readStoredCategory(initialData);
    savedCategoryRef.current = stored;
    if (initialData) {
      setFormData({
        nameEN: initialData.nameEN || initialData.name || '',
        nameDE: initialData.nameDE || '',
        descriptionEN: initialData.descriptionEN || initialData.description || '',
        descriptionDE: initialData.descriptionDE || '',
        allergens: initialData.allergens || [],
        price: initialData.price?.toString() || '',
        category: resolveCategoryValue(stored, categories),
        vat_Rate: initialData.vat_Rate || (/beverages|getränke|getraenke/i.test(initialData.category || '') ? 'STANDARD' : 'REDUCED_1'),
        availability: initialData.availability ?? true,
        isVegetarian: initialData.isVegetarian ?? false,
        prepMinutes: initialData.prepMinutes ? String(initialData.prepMinutes) : '',
        noticeHours: initialData.noticeHours ? String(initialData.noticeHours) : '',
        pickupBlocked: initialData.pickupBlocked ?? false,
      });
      setImageFile(null);
      setErrors({});
    } else {
      setFormData({
        nameEN: '', nameDE: '', descriptionEN: '', descriptionDE: '', allergens: [],
        price: '', category: '', vat_Rate: 'REDUCED_1', availability: true, isVegetarian: false,
        prepMinutes: '', noticeHours: '', pickupBlocked: false,
      });
      setImageFile(null);
      setErrors({});
    }
    // categories is applied in the effect below so a late category list
    // does not reset the rest of the form the user may already be editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  useEffect(() => {
    if (!savedCategoryRef.current || categories.length === 0) return;
    const resolved = resolveCategoryValue(savedCategoryRef.current, categories);
    setFormData((prev) => {
      // Only fill or normalize. Never replace a category the user already picked.
      if (!prev.category || prev.category === savedCategoryRef.current) {
        return prev.category === resolved ? prev : { ...prev, category: resolved };
      }
      return prev;
    });
  }, [categories]);

  const validate = () => {
    const newErrors = {};
    if (!formData.nameEN.trim()) newErrors.nameEN = 'English name is required';
    if (!formData.nameDE.trim()) newErrors.nameDE = 'German name is required';
    if (!formData.price || isNaN(formData.price) || parseFloat(formData.price) < 0) newErrors.price = 'Valid price is required (min 0)';
    const categoryToSave = formData.category || savedCategoryRef.current;
    if (!categoryToSave) newErrors.category = 'Category is required';

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
      // Never send a blank category over an existing one. A cleared dropdown
      // used to overwrite the stored value on save.
      const categoryToSave = resolveCategoryValue(
        formData.category || savedCategoryRef.current,
        categories,
      );
      submitData.append('category', categoryToSave);
      submitData.append('vat_Rate', formData.vat_Rate);
      submitData.append('availability', formData.availability);
      submitData.append('isVegetarian', formData.isVegetarian);
      const wholeNumber = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
      submitData.append('prepMinutes', wholeNumber(formData.prepMinutes, 600));
      submitData.append('noticeHours', wholeNumber(formData.noticeHours, 720));
      submitData.append('pickupBlocked', formData.pickupBlocked);
      
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
            <select
              id="menuItemCategory"
              value={formData.category}
              onChange={(e) => {
                const next = e.target.value;
                savedCategoryRef.current = next;
                setFormData((prev) => ({ ...prev, category: next, vat_Rate: /beverages|getränke|getraenke/i.test(next) ? 'STANDARD' : 'REDUCED_1' }));
              }}
              className={`flex h-9 w-full items-center rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${errors.category ? 'border-destructive focus:ring-destructive' : 'border-input'} ${formData.category ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <option value="" disabled>
                {categoriesLoading ? 'Loading categories…' : 'Select a category'}
              </option>
              {formData.category && !categories.some((c) => c.name === formData.category) && (
                <option value={formData.category}>{formData.category}</option>
              )}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {language === 'de' ? (cat.name_de || cat.name) : cat.name}
                </option>
              ))}
            </select>
          </MobileFormField>

          <MobileFormField label="VAT rate" id="menuItemVatRate">
            <Select value={formData.vat_Rate} onValueChange={value => setFormData(prev => ({...prev, vat_Rate: value}))}>
              <SelectTrigger id="menuItemVatRate"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="STANDARD">Standard — 20%</SelectItem>
                <SelectItem value="REDUCED_1">Reduced 1 — 10%</SelectItem>
                <SelectItem value="REDUCED_2">Reduced 2 — 13%</SelectItem>
                <SelectItem value="SPECIAL">Special — 19%</SelectItem>
                <SelectItem value="ZERO">Zero — 0%</SelectItem>
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

        {/* Kitchen timing for online pickup orders */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-4">
          <div>
            <p className="font-medium text-base">Kitchen &amp; online pickup</p>
            <p className="text-sm text-muted-foreground">
              Used for online pre-orders: the earliest pickup time and when the ticket goes to the kitchen.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="menuItemPrep">Preparation time (minutes)</Label>
              <Input
                id="menuItemPrep"
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                step={5}
                placeholder="Default from pickup settings"
                value={formData.prepMinutes}
                onChange={(e) => setFormData((prev) => ({ ...prev, prepMinutes: e.target.value }))}
                className="h-12 sm:h-11"
              />
              <p className="text-xs text-muted-foreground">Zubereitungszeit. Leave empty to use the default.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menuItemNotice">Order in advance (hours)</Label>
              <Input
                id="menuItemNotice"
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                placeholder="0 = same day"
                value={formData.noticeHours}
                onChange={(e) => setFormData((prev) => ({ ...prev, noticeHours: e.target.value }))}
                className="h-12 sm:h-11"
              />
              <p className="text-xs text-muted-foreground">Vorlaufzeit, e.g. 24 for dishes that need marinating overnight.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Switch
              id="menuItemPickupBlocked"
              checked={formData.pickupBlocked}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, pickupBlocked: checked }))}
              className="mt-1 shrink-0"
            />
            <div className="grid gap-1.5 leading-tight">
              <Label htmlFor="menuItemPickupBlocked" className="cursor-pointer font-medium text-base">Not for online orders</Label>
              <p className="text-sm text-muted-foreground">The dish stays on the menu but guests cannot order it for pickup.</p>
            </div>
          </div>
        </div>

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
