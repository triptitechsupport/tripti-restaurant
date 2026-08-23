import React from 'react';
import TableConfigurationPanel from './TableConfigurationPanel.jsx';
import AdminMaxTableNumberSettings from './AdminMaxTableNumberSettings.jsx';
import { Info } from 'lucide-react';

export default function AdminTableSettings() {
  return (
    <div className="space-y-8">
      <div className="bg-card border-2 border-border rounded-2xl p-6 md:p-8 shadow-md">
        <div className="flex items-center gap-4 mb-3">
          <div className="h-12 w-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-sm">
            <Info className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">Configure Available Tables</h2>
        </div>
        <p className="text-muted-foreground font-medium max-w-3xl">
          Manage your restaurant's physical seating layout. Add table names or numbers, assign them to specific rooms, and optionally define their seating capacity. Tables configured here will be available for quick assignment in the Reservations dashboard.
        </p>
      </div>

      <AdminMaxTableNumberSettings />

      <TableConfigurationPanel />
    </div>
  );
}