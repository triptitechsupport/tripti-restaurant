import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileFormField from '@/components/MobileFormField.jsx';

export default function CategoryFormModal({ isOpen, onClose, onSuccess, editingCategory }) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    name_de: '',
    description: '',
    display_order: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setFormData({
          name: editingCategory.name || '',
          name_de: editingCategory.name_de || '',
          description: editingCategory.description || '',
          display_order:
            editingCategory.display_order != null
              ? String(editingCategory.display_order)
              : '',
        });
      } else {
        setFormData({ name: '', name_de: '', description: '', display_order: '' });
      }
      setErrors({});
    }
  }, [isOpen, editingCategory]);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'English name is required';
    if (!formData.name_de.trim()) newErrors.name_de = 'German name is required';
    if (
      formData.display_order !== '' &&
      (isNaN(formData.display_order) || parseFloat(formData.display_order) < 0)
    )
      newErrors.display_order = 'Display order must be a positive number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        name_de: formData.name_de.trim(),
        description: formData.description.trim(),
        display_order:
          formData.display_order === '' ? null : parseFloat(formData.display_order),
      };

      if (editingCategory && editingCategory.id) {
        await pb.collection('categories').update(editingCategory.id, payload, { $autoCancel: false });
        toast.success('Category updated successfully');
      } else {
        await pb.collection('categories').create(payload, { $autoCancel: false });
        toast.success('Category created successfully');
      }

      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save category:', error);
      const msg =
        error?.response?.data?.name?.message ||
        error?.message ||
        'Failed to save category.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="modal-mobile-safe max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-primary text-xl">
            {editingCategory ? 'Edit Category' : 'Add New Category'}
          </DialogTitle>
          <DialogDescription>
            {editingCategory
              ? 'Update the category details below.'
              : 'Create a new menu category. It will appear in the category dropdown when adding or editing menu items.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <MobileFormField label={<>Category Name (English) <span className="text-destructive">*</span></>} id="catNameEN" error={errors.name}>
              <Input
                id="catNameEN"
                placeholder="e.g., Appetizers"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </MobileFormField>

            <MobileFormField label={<>Category Name (German) <span className="text-destructive">*</span></>} id="catNameDE" error={errors.name_de}>
              <Input
                id="catNameDE"
                placeholder="z. B. Vorspeisen"
                value={formData.name_de}
                onChange={(e) => setFormData(prev => ({ ...prev, name_de: e.target.value }))}
                className={errors.name_de ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </MobileFormField>
          </div>

          <MobileFormField label="Description (optional)" id="catDesc">
            <Textarea
              id="catDesc"
              rows={2}
              placeholder="Short description of this category..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="resize-none"
            />
          </MobileFormField>

          <MobileFormField label="Display Order (optional)" id="catOrder" error={errors.display_order} description="Lower numbers appear first in the dropdown.">
            <Input
              id="catOrder"
              type="number"
              min="0"
              step="1"
              placeholder="e.g., 3"
              value={formData.display_order}
              onChange={(e) => setFormData(prev => ({ ...prev, display_order: e.target.value }))}
              className={errors.display_order ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </MobileFormField>

          <DialogFooter className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border/60">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="w-full sm:w-auto h-12 sm:h-11">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto min-w-[140px] h-12 sm:h-11 font-medium">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </div>
              ) : (editingCategory ? 'Save Category' : 'Add Category')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
