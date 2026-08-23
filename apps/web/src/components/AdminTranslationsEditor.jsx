import React, { useState, useEffect } from 'react';
import { Search, Loader2, Save, Plus } from 'lucide-react';
import { translations as defaultTranslations } from '@/lib/translations.js';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function AdminTranslationsEditor() {
  const { refreshTranslations } = useLanguage();
  
  // UI Translations state
  const [translationsList, setTranslationsList] = useState([]);
  const [dbRecordsMap, setDbRecordsMap] = useState({});
  const [loadingUI, setLoadingUI] = useState(true);
  const [searchQueryUI, setSearchQueryUI] = useState('');
  const [savingKey, setSavingKey] = useState(null);

  // Menu Items state
  const [menuItemsList, setMenuItemsList] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [searchQueryMenu, setSearchQueryMenu] = useState('');
  const [savingMenuId, setSavingMenuId] = useState(null);

  useEffect(() => {
    fetchTranslations();
    fetchMenuItems();
  }, []);

  const fetchTranslations = async () => {
    setLoadingUI(true);
    try {
      const records = await pb.collection('translations').getFullList({ $autoCancel: false });
      
      const recordMap = {};
      records.forEach(r => {
        recordMap[r.key] = r;
      });
      setDbRecordsMap(recordMap);

      const defaultKeys = Object.keys(defaultTranslations.en);
      const combinedList = defaultKeys.map(key => {
        const dbEntry = recordMap[key];
        return {
          key,
          englishText: dbEntry ? dbEntry.englishText : defaultTranslations.en[key],
          germanText: dbEntry ? dbEntry.germanText : defaultTranslations.de[key] || defaultTranslations.en[key],
          isNew: false
        };
      });

      records.forEach(r => {
        if (!defaultKeys.includes(r.key)) {
          combinedList.push({
            key: r.key,
            englishText: r.englishText,
            germanText: r.germanText,
            isNew: false
          });
        }
      });

      setTranslationsList(combinedList);
    } catch (error) {
      console.error('Failed to fetch UI translations:', error);
      toast.error('Failed to load translations');
    } finally {
      setLoadingUI(false);
    }
  };

  const fetchMenuItems = async () => {
    setLoadingMenu(true);
    try {
      const records = await pb.collection('menu_items').getFullList({ sort: 'category,name', $autoCancel: false });
      setMenuItemsList(records.map(r => ({
        ...r,
        nameDE: r.nameDE || '',
        descriptionDE: r.descriptionDE || ''
      })));
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
      toast.error('Failed to load menu items');
    } finally {
      setLoadingMenu(false);
    }
  };

  const filteredUITranslations = translationsList.filter(t => 
    t.key.toLowerCase().includes(searchQueryUI.toLowerCase()) ||
    t.englishText.toLowerCase().includes(searchQueryUI.toLowerCase()) ||
    t.germanText.toLowerCase().includes(searchQueryUI.toLowerCase())
  );

  const filteredMenuItems = menuItemsList.filter(m => 
    m.name.toLowerCase().includes(searchQueryMenu.toLowerCase()) ||
    (m.nameDE && m.nameDE.toLowerCase().includes(searchQueryMenu.toLowerCase())) ||
    m.category.toLowerCase().includes(searchQueryMenu.toLowerCase())
  );

  // Handlers for UI Translations
  const handleUITextChange = (key, field, value) => {
    setTranslationsList(prev => prev.map(t => 
      t.key === key ? { ...t, [field]: value } : t
    ));
  };

  const handleSaveUI = async (item) => {
    if (!item.germanText.trim() || !item.englishText.trim() || !item.key.trim()) {
      toast.error('Key and texts cannot be empty');
      return;
    }

    setSavingKey(item.key);
    try {
      const existingRecord = dbRecordsMap[item.key];
      
      if (existingRecord) {
        await pb.collection('translations').update(existingRecord.id, {
          englishText: item.englishText,
          germanText: item.germanText,
        }, { $autoCancel: false });
      } else {
        const newRecord = await pb.collection('translations').create({
          key: item.key,
          englishText: item.englishText,
          germanText: item.germanText,
          category: 'other'
        }, { $autoCancel: false });
        
        setDbRecordsMap(prev => ({ ...prev, [item.key]: newRecord }));
      }

      toast.success(`Saved translation for ${item.key}`);
      refreshTranslations();
    } catch (error) {
      console.error('Save translation error:', error);
      toast.error('Failed to save UI translation');
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddNewUI = () => {
    const newKey = `new_key_${Date.now()}`;
    setTranslationsList([{ key: newKey, englishText: '', germanText: '', isNew: true }, ...translationsList]);
  };

  // Handlers for Menu Items
  const handleMenuTextChange = (id, field, value) => {
    setMenuItemsList(prev => prev.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const handleSaveMenu = async (item) => {
    setSavingMenuId(item.id);
    try {
      await pb.collection('menu_items').update(item.id, {
        nameDE: item.nameDE,
        descriptionDE: item.descriptionDE
      }, { $autoCancel: false });
      
      toast.success(`Saved DE translation for ${item.name}`);
    } catch (error) {
      console.error('Save menu item error:', error);
      toast.error('Failed to save menu translation');
    } finally {
      setSavingMenuId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Translations Editor</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage English and German text content across the system.</p>
        </div>
      </div>

      <Tabs defaultValue="ui" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 mb-4 bg-muted">
          <TabsTrigger value="ui">UI & Categories</TabsTrigger>
          <TabsTrigger value="menu">Menu Items</TabsTrigger>
        </TabsList>

        <TabsContent value="ui" className="mt-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search UI keys or text..." 
                value={searchQueryUI}
                onChange={(e) => setSearchQueryUI(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Button onClick={handleAddNewUI} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            {loadingUI ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-4 p-4 bg-muted/30 font-semibold text-sm text-muted-foreground">
                  <div className="col-span-3">Translation Key</div>
                  <div className="col-span-4">English (EN)</div>
                  <div className="col-span-4">German (DE)</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>
                
                <div className="max-h-[600px] overflow-y-auto">
                  {filteredUITranslations.map((item) => (
                    <div key={item.key} className="grid grid-cols-12 gap-4 p-4 items-start hover:bg-muted/10 transition-colors">
                      <div className="col-span-3">
                        {item.isNew ? (
                          <Input 
                            value={item.key} 
                            onChange={(e) => handleUITextChange(item.key, 'key', e.target.value)}
                            className="h-9 font-mono text-xs"
                            placeholder="translation_key"
                          />
                        ) : (
                          <span className="font-mono text-xs font-medium text-muted-foreground break-all">
                            {item.key}
                          </span>
                        )}
                      </div>
                      <div className="col-span-4">
                        <Input 
                          value={item.englishText} 
                          onChange={(e) => handleUITextChange(item.key, 'englishText', e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input 
                          value={item.germanText} 
                          onChange={(e) => handleUITextChange(item.key, 'germanText', e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handleSaveUI(item)}
                          disabled={savingKey === item.key}
                          className="h-9 w-full"
                        >
                          {savingKey === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filteredUITranslations.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      No UI translations found matching your search.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="menu" className="mt-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search menu item or category..." 
                value={searchQueryMenu}
                onChange={(e) => setSearchQueryMenu(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            {loadingMenu ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-4 p-4 bg-muted/30 font-semibold text-sm text-muted-foreground">
                  <div className="col-span-4">Dish Info (EN)</div>
                  <div className="col-span-3">German Name (nameDE)</div>
                  <div className="col-span-4">German Description (descriptionDE)</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>
                
                <div className="max-h-[600px] overflow-y-auto">
                  {filteredMenuItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-4 p-4 items-start hover:bg-muted/10 transition-colors">
                      <div className="col-span-4 flex flex-col gap-1">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground bg-muted w-max px-1.5 py-0.5 rounded">{item.category}</span>
                      </div>
                      <div className="col-span-3">
                        <Input 
                          value={item.nameDE} 
                          onChange={(e) => handleMenuTextChange(item.id, 'nameDE', e.target.value)}
                          placeholder="German name..."
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input 
                          value={item.descriptionDE} 
                          onChange={(e) => handleMenuTextChange(item.id, 'descriptionDE', e.target.value)}
                          placeholder="German description..."
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handleSaveMenu(item)}
                          disabled={savingMenuId === item.id}
                          className="h-9 w-full"
                        >
                          {savingMenuId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filteredMenuItems.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      No menu items found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}