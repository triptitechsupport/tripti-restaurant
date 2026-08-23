import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MenuItemForm from './MenuItemForm.jsx';

export default function MenuItemEditModal({ isOpen, onClose, initialData, onSuccess }) {
  const handleSuccess = () => {
    if (onSuccess) onSuccess();
    onClose();
  };

  const title = initialData ? 'Edit Item' : 'Add New Item';
  const description = initialData 
    ? `Update details for "${initialData.name}".`
    : 'Fill in the details to add a new dish to the menu.';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2">
          <MenuItemForm 
            initialData={initialData}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}