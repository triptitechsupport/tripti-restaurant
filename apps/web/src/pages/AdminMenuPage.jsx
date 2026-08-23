import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, LayoutGrid } from 'lucide-react';
import MenuItemsList from '@/components/MenuItemsList.jsx';
import MenuItemEditModal from '@/components/MenuItemEditModal.jsx';
import { Button } from '@/components/ui/button';

export default function AdminMenuPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const handleAddNew = () => {
    setSelectedItem(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedItem(null), 300);
  };

  const handleModalSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      <Helmet>
        <title>Manage Menu - Admin Portal</title>
      </Helmet>

      <main className="h-full py-12 bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 bg-card p-6 md:p-8 rounded-3xl border-2 border-border shadow-md">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-primary flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <LayoutGrid className="h-8 w-8 text-primary" />
                </div>
                Manage Menu
              </h1>
              <p className="text-muted-foreground mt-3 text-base md:text-lg font-medium">
                Add, edit, or remove items from your restaurant's digital menu.
              </p>
            </div>
            
            <Button 
              onClick={handleAddNew}
              size="lg"
              className="w-full sm:w-auto shrink-0 shadow-lg text-lg"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add New Item
            </Button>
          </div>

          {/* List Component */}
          <div className="bg-card border-2 border-border rounded-3xl shadow-xl p-6 md:p-8">
            <MenuItemsList 
              refreshTrigger={refreshTrigger} 
              onEdit={handleEdit} 
            />
          </div>

        </div>
      </main>

      {/* Edit/Add Modal */}
      <MenuItemEditModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        initialData={selectedItem}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}