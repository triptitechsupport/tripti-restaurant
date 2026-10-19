import React, { useState } from 'react';
import { ShoppingBag, Settings, Archive } from 'lucide-react';
import pb from '@/lib/pocketbaseClient.js';
import OrderManagementTable from '@/components/OrderManagementTable.jsx';
import PickupOrdersBoard from './PickupOrdersBoard.jsx';
import PickupSettingsForm from './PickupSettingsForm.jsx';

// Admin "Orders" tab: online pickup orders, their settings, and the older web orders.
const VIEWS = [
  { key: 'board', label: 'Abholungen', icon: ShoppingBag },
  { key: 'settings', label: 'Einstellungen', icon: Settings },
  { key: 'legacy', label: 'Ältere Bestellungen', icon: Archive },
];

export default function AdminPickupSection() {
  const [view, setView] = useState('board');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setView(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition-colors ${view === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>
      {view === 'board' && <PickupOrdersBoard client={pb} role="admin" />}
      {view === 'settings' && <PickupSettingsForm client={pb} />}
      {view === 'legacy' && <OrderManagementTable />}
    </div>
  );
}
