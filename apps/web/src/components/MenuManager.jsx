import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X, Tag, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import MenuItemsList from '@/components/MenuItemsList.jsx';
import MenuItemForm from '@/components/MenuItemForm.jsx';
import CategoryFormModal from '@/components/CategoryFormModal.jsx';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import {
  menuItemsExportColumns, menuItemsImportConfig,
  categoriesExportColumns, categoriesImportConfig,
} from '@/lib/csvConfigs.js';
import defaultPb from '@/lib/pocketbaseClient.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Menu items and categories. Used by the admin dashboard and by the kitchen
// manager (who passes their own login as `client`).
export default function MenuManager({ client }) {
  const pb = client || defaultPb;
  const { t, language } = useLanguage();
  const de = language === 'de';
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState(null);
  const [listKey, setListKey] = useState(0);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      setCategories(await pb.collection('categories').getFullList({ sort: 'display_order,name', $autoCancel: false }));
    } catch (_) {
      toast.error(de ? 'Kategorien konnten nicht geladen werden' : 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  }, [pb, de]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const refreshList = () => setListKey((k) => k + 1);
  const closeForm = () => { setShowMenuForm(false); setEditingMenuItem(null); };

  const deleteCategory = async () => {
    if (!categoryToDelete) return;
    setIsDeletingCategory(true);
    try {
      await pb.collection('categories').delete(categoryToDelete.id, { $autoCancel: false });
      setCategories((prev) => prev.filter((c) => c.id !== categoryToDelete.id));
      toast.success(de ? 'Kategorie gelöscht' : 'Category deleted');
    } catch (err) {
      toast.error(err.message || (de ? 'Löschen fehlgeschlagen' : 'Failed to delete category.'));
    } finally {
      setIsDeletingCategory(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-mobile rounded-2xl border-2 border-border shadow-md">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">{t('menuManagement')}</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">{de ? 'Gerichte, Preise, Kategorien und Verfügbarkeit.' : 'Dishes, prices, categories and availability.'}</p>
        </div>
        {!showMenuForm && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }} variant="outline" className="w-full sm:w-auto min-h-touch shadow-sm">
              <Tag className="h-4 w-4 mr-2" /> {de ? 'Kategorie hinzufügen' : 'Add Category'}
            </Button>
            <Button onClick={() => setShowMenuForm(true)} className="w-full sm:w-auto min-h-touch shadow-md">
              <Plus className="h-4 w-4 mr-2" /> {t('addNewItem')}
            </Button>
          </div>
        )}
      </div>

      {!showMenuForm && (
        <div className="bg-card border-2 border-border rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-serif font-bold text-primary">{de ? 'Speisekarte als CSV' : 'Menu Items — CSV Export / Import'}</h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {de
                  ? 'Speisekarte als CSV exportieren, bearbeiten und wieder importieren. Zuordnung über ID oder Name (EN).'
                  : 'Export the menu to CSV, edit offline, then re-import to bulk create or update items. Matched by ID or Name (EN).'}
              </p>
            </div>
            <div className="sm:ml-auto">
              <CsvImportExport
                client={pb}
                collection="menu_items"
                entityLabel="menu items"
                exportFileName="menu_items.csv"
                exportColumns={menuItemsExportColumns}
                importConfig={menuItemsImportConfig}
                onImportComplete={refreshList}
              />
            </div>
          </div>
        </div>
      )}

      {!showMenuForm && (
        <div className="bg-card border-2 border-border rounded-2xl p-mobile shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-serif font-bold tracking-tight text-primary">{de ? 'Kategorien' : 'Menu Categories'}</h3>
            <span className="text-xs text-muted-foreground font-medium">({categories.length})</span>
            <div className="ml-auto">
              <CsvImportExport
                client={pb}
                collection="categories"
                entityLabel="categories"
                exportFileName="categories.csv"
                exportColumns={categoriesExportColumns}
                importConfig={categoriesImportConfig}
                onImportComplete={fetchCategories}
              />
            </div>
          </div>
          {categoriesLoading ? (
            <p className="text-sm text-muted-foreground italic">{de ? 'Kategorien werden geladen…' : 'Loading categories…'}</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">{de ? 'Noch keine Kategorien.' : 'No categories yet. Click “Add Category” to create one.'}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg pl-3 pr-1.5 py-1.5">
                  <span className="text-sm font-medium text-foreground">{cat.name}</span>
                  {cat.name_de && <span className="text-xs text-muted-foreground">/ {cat.name_de}</span>}
                  {cat.display_order != null && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5">#{cat.display_order}</span>
                  )}
                  <button onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }} className="text-blue-600 hover:bg-blue-50 rounded p-1" aria-label={`Edit ${cat.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setCategoryToDelete(cat)} className="text-red-600 hover:bg-red-50 rounded p-1" aria-label={`Delete ${cat.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showMenuForm ? (
        <Card className="border-2 border-primary shadow-xl animate-in fade-in duration-300 rounded-2xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b-2 border-border bg-primary/5 pb-4">
            <div>
              <CardTitle className="font-serif text-primary text-xl">{editingMenuItem ? t('editItem') : t('addNewItem')}</CardTitle>
              <CardDescription className="font-medium text-foreground">{de ? 'Angaben zum Gericht ausfüllen.' : 'Fill in the details for the dish.'}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={closeForm} className="touch-target hover:bg-destructive/10 hover:text-destructive" aria-label={de ? 'Schließen' : 'Close'}>
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-6 px-mobile bg-card">
            <MenuItemForm client={pb} initialData={editingMenuItem} onSuccess={() => { closeForm(); refreshList(); }} onCancel={closeForm} />
          </CardContent>
        </Card>
      ) : (
        <MenuItemsList key={listKey} client={pb} onEdit={(item) => { setEditingMenuItem(item); setShowMenuForm(true); }} />
      )}

      <CategoryFormModal
        client={pb}
        isOpen={showCategoryForm}
        onClose={() => { setShowCategoryForm(false); setEditingCategory(null); }}
        onSuccess={() => { setShowCategoryForm(false); setEditingCategory(null); fetchCategories(); }}
        editingCategory={editingCategory}
      />

      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && !isDeletingCategory && setCategoryToDelete(null)}>
        <AlertDialogContent className="modal-mobile-safe">
          <AlertDialogHeader>
            <AlertDialogTitle>{de ? 'Kategorie löschen?' : 'Delete this category?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {de
                ? <>Entfernt <strong>{categoryToDelete?.name}</strong> aus der Liste. Gerichte behalten ihre Kategorie und können einzeln umgestellt werden.</>
                : <>This removes <strong>{categoryToDelete?.name}</strong> from the category list. Existing menu items keep their current category value — reassign them individually if needed.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel disabled={isDeletingCategory} className="h-12 sm:h-10 mt-0">{de ? 'Abbrechen' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteCategory(); }}
              disabled={isDeletingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 sm:h-10"
            >
              {isDeletingCategory ? '…' : (de ? 'Kategorie löschen' : 'Delete Category')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
