import React, { useState, useEffect } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pencil, Trash2, Image as ImageIcon, AlertCircle, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileTableCard from '@/components/MobileTableCard.jsx';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function MenuItemsList({ refreshTrigger, onEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  const isMobile = useIsMobile();

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await pb.collection('menu_items').getFullList({
        sort: 'category,nameEN',
        $autoCancel: false,
      });
      setItems(records);
    } catch (err) {
      console.error('Error fetching menu items:', err);
      setError(err.message || 'Failed to fetch menu items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [refreshTrigger]);

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    
    setIsDeleting(true);
    try {
      await pb.collection('menu_items').delete(itemToDelete.id, { $autoCancel: false });
      setItems(prev => prev.filter(item => item.id !== itemToDelete.id));
      toast.success('Item deleted successfully');
    } catch (err) {
      console.error('Failed to delete item:', err);
      toast.error(err.message || 'Failed to delete item.');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      await pb.collection('menu_items').update(item.id, { availability: !item.availability }, { $autoCancel: false });
      setItems(items.map(i => i.id === item.id ? { ...i, availability: !i.availability } : i));
      toast.success(`Marked as ${!item.availability ? 'Available' : 'Unavailable'}`);
    } catch (err) {
      toast.error('Failed to toggle availability');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-card border rounded-xl shadow-sm text-destructive">
        <AlertCircle className="h-10 w-10 mb-4 opacity-70" />
        <h3 className="text-lg font-medium text-foreground mb-2">Error Loading Menu</h3>
        <p className="text-muted-foreground text-sm max-w-md text-center mb-6">{error}</p>
        <Button onClick={fetchItems} variant="outline" className="min-h-touch">
          <RefreshCw className="h-4 w-4 mr-2" /> Retry Fetch
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-dashed rounded-xl shadow-sm text-muted-foreground">
          <ImageIcon className="h-12 w-12 mb-4 opacity-20" />
          <h3 className="text-xl font-medium text-foreground mb-2">No menu items found</h3>
          <p className="text-center max-w-sm">Your menu is currently empty. Click the button above to add your first dish.</p>
        </div>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <MobileTableCard
              key={item.id}
              header={
                <div className="flex items-center gap-3">
                  {item.image ? (
                    <img
                      src={pb.files.getURL(item, item.image, { thumb: '100x100' })}
                      alt={item.nameEN || item.name}
                      className="w-14 h-14 rounded-lg object-cover bg-muted shrink-0"
                      onClick={() => setPreviewImage(pb.files.getURL(item, item.image))}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border shrink-0">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-foreground text-base leading-tight mb-1">
                      {item.nameEN || item.name}
                    </div>
                    {item.nameDE && (
                      <div className="text-sm text-muted-foreground leading-tight mb-1">
                        {item.nameDE}
                      </div>
                    )}
                    <Badge variant="secondary" className="font-normal text-xs">{item.category}</Badge>
                  </div>
                </div>
              }
              sideContent={
                <>
                  <div className="font-bold text-primary text-lg tabular-nums">€{item.price.toFixed(2)}</div>
                  {item.isVegetarian && <span className="text-[10px] font-bold uppercase text-green-600 bg-green-100 px-1.5 py-0.5 rounded-sm">Veg</span>}
                </>
              }
              expandedContent={
                <div className="text-sm space-y-3">
                  {item.descriptionEN || item.description ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description (EN)</p>
                      <p className="text-muted-foreground italic">{item.descriptionEN || item.description}</p>
                    </div>
                  ) : null}
                  {item.descriptionDE ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description (DE)</p>
                      <p className="text-muted-foreground italic">{item.descriptionDE}</p>
                    </div>
                  ) : null}
                  {item.allergens && item.allergens.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Allergens</p>
                      <p className="text-foreground">Allergens: {item.allergens.join(', ')}</p>
                    </div>
                  ) : null}
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="font-medium">Availability</span>
                    <Button 
                      variant={item.availability ? 'default' : 'outline'} 
                      size="sm" 
                      className={`h-8 px-3 ${item.availability ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-muted-foreground'}`}
                      onClick={() => handleToggleAvailability(item)}
                    >
                      {item.availability ? 'Available' : 'Unavailable'}
                    </Button>
                  </div>
                </div>
              }
              actions={
                <div className="grid grid-cols-2 gap-3 w-full">
                  <Button variant="outline" className="h-11" onClick={() => onEdit(item)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button variant="outline" className="h-11 text-destructive hover:bg-destructive/10 border-destructive/20" onClick={() => setItemToDelete(item)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden hidden md:block">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[90px] font-medium text-muted-foreground">Image</TableHead>
                <TableHead className="font-medium text-muted-foreground min-w-[200px]">Name (EN / DE)</TableHead>
                <TableHead className="font-medium text-muted-foreground">Category</TableHead>
                <TableHead className="font-medium text-muted-foreground">Price</TableHead>
                <TableHead className="font-medium text-muted-foreground min-w-[150px]">Allergens</TableHead>
                <TableHead className="font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="text-right font-medium text-muted-foreground pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell>
                    {item.image ? (
                      <button 
                        onClick={() => setPreviewImage(pb.files.getURL(item, item.image, { thumb: '100x100' }))}
                        className="relative rounded-lg overflow-hidden block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={pb.files.getURL(item, item.image, { thumb: '100x100' })}
                          alt={item.nameEN || item.name}
                          className="w-12 h-12 object-cover bg-muted transition-transform hover:scale-105"
                        />
                      </button>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border border-border/50">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{item.nameEN || item.name}</div>
                    {item.nameDE && (
                      <div className="text-sm text-muted-foreground mt-0.5">{item.nameDE}</div>
                    )}
                    {item.isVegetarian && (
                      <span className="text-[11px] font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-sm inline-block mt-1">
                        Vegetarian
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-secondary-foreground">
                      {item.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    €{item.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.allergens && item.allergens.length > 0 ? (
                      <span className="line-clamp-2 font-medium" title={item.allergens.join(', ')}>Allergens: {item.allergens.join(', ')}</span>
                    ) : (
                      <span className="italic opacity-50">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.availability ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200 dark:border-emerald-800/30 dark:text-emerald-400 font-normal cursor-pointer" onClick={() => handleToggleAvailability(item)}>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground font-normal cursor-pointer" onClick={() => handleToggleAvailability(item)}>
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(item)}
                        className="h-9 w-9 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        aria-label={`Edit ${item.nameEN || item.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setItemToDelete(item)}
                        className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        aria-label={`Delete ${item.nameEN || item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && !isDeleting && setItemToDelete(null)}>
        <AlertDialogContent className="modal-mobile-safe">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{itemToDelete?.nameEN || itemToDelete?.name}</strong> from the menu. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel disabled={isDeleting} className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 sm:h-10"
            >
              {isDeleting ? 'Deleting...' : 'Delete Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent aria-describedby="image-preview-description" className="max-w-3xl w-[95vw] sm:w-full bg-transparent border-none shadow-none p-0 overflow-hidden flex items-center justify-center">
          <DialogHeader className="sr-only">
            <DialogTitle>Image Preview</DialogTitle>
            <DialogDescription id="image-preview-description">Preview of the selected menu item image.</DialogDescription>
          </DialogHeader>
          {previewImage && (
            <div className="relative group">
              <Button variant="outline" size="icon" className="absolute top-2 right-2 rounded-full h-8 w-8 z-10 bg-background/50 hover:bg-background/80 text-foreground border-none backdrop-blur" onClick={() => setPreviewImage(null)}>
                <X className="h-4 w-4" />
              </Button>
              <img 
                src={previewImage} 
                alt="Menu item preview" 
                className="max-h-[85vh] max-w-full rounded-xl object-contain bg-black/50 shadow-2xl"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}