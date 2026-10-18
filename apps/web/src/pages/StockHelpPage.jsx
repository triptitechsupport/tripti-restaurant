import React from 'react';
import { PackageCheck, Boxes, Trash2, History, ShieldCheck } from 'lucide-react';
import HelpLayout from '@/components/HelpLayout.jsx';

export default function StockHelpPage() {
  const sections = [
    {
      id: 'overview',
      icon: PackageCheck,
      title: 'Overview & Access',
      intro:
        'The Stock & Waste Dashboard is a separate, login-protected area for staff who manage inventory and record waste. It uses its own login (stock_users) so stock staff can be signed in at the same time as waiters, kitchen, and admins without affecting their sessions.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Permission'],
          rows: [
            ['Login page', 'Enter your Login ID and password to sign in.', 'stock_users / admin'],
            ['Logout (header)', 'Clears the stock session and returns to the login page.', 'All signed-in users'],
            ['Admin button (header)', 'Admins return to the Admin Dashboard without logging out.', 'Admin only'],
            ['EN / DE switch', 'Switches the dashboard language.', 'All'],
          ],
        },
      ],
    },
    {
      id: 'inventory',
      icon: Boxes,
      title: 'Inventory Tab',
      intro:
        'View, search, add, edit, adjust, and delete stock items. Each item tracks a current quantity, a minimum stock level, and an optional link to a menu item.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Next view / result'],
          rows: [
            ['Search box', 'Filters items live by name or category.', 'Filtered list'],
            ['Low stock only', 'Shows only items at or below their minimum stock level.', 'Filtered list'],
            ['Add Item', 'Opens the item form (name, category, unit, quantity, min stock, notes, linked menu item).', 'Item form'],
            ['Edit (pencil)', 'Opens the item form pre-filled for that row.', 'Item form'],
            ['Adjust', 'Opens the adjustment dialog to restock, correct, or waste stock with a reason.', 'Adjust dialog → new level + history entry'],
            ['Delete (trash)', 'Removes the item after confirmation. Adjustment history is kept for audit.', 'Confirm dialog'],
          ],
        },
      ],
      notes: [
        'Status badges: In Stock (above minimum), Low Stock (at or below minimum but above zero), Out of Stock (zero).',
        'Every adjustment (restock, correction, waste) is recorded in Stock History with the previous and new quantity, reason, and responsible user.',
      ],
    },
    {
      id: 'waste',
      icon: Trash2,
      title: 'Waste Tab',
      intro:
        'Record wasted items and review the full waste history. Recording waste also reduces the linked stock item’s quantity automatically.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Next view / result'],
          rows: [
            ['Record Waste form', 'Capture item, quantity, unit, reason, date/time, responsible user (auto-filled), and notes.', 'New waste record + stock reduced'],
            ['Reason filter', 'Filter waste history by reason (spoiled, expired, damaged, etc.).', 'Filtered history'],
            ['Search', 'Filter waste history by item name.', 'Filtered history'],
            ['Waste history table', 'Lists every waste record with date, item, quantity, reason, responsible user, notes.', '—'],
          ],
        },
      ],
      notes: [
        'Required fields: item name, quantity, reason, and date/time.',
        'If the wasted item is linked to a stock item, its quantity is reduced and a waste adjustment is logged in Stock History.',
      ],
    },
    {
      id: 'history',
      icon: History,
      title: 'Stock History Tab',
      intro:
        'A complete, audit-friendly trail of every stock level change — restocks, corrections, waste, and initial counts.',
      tables: [
        {
          headers: ['Column', 'Meaning'],
          rows: [
            ['Date', 'When the adjustment was made.'],
            ['Item', 'The stock item that changed.'],
            ['Type', 'restock, correction, waste, or initial.'],
            ['Previous → New', 'The quantity before and after the change.'],
            ['Change', 'The delta applied (+/−).'],
            ['Reason / Notes', 'Why the change was made.'],
            ['By', 'The responsible user and their role.'],
          ],
        },
      ],
      notes: ['History records are read-only. Only an admin can delete them.'],
    },
    {
      id: 'permissions',
      icon: ShieldCheck,
      title: 'Permissions & Roles',
      intro:
        'The stock area is isolated from the waiter, kitchen, and public surfaces. Existing roles keep their current access; only stock_users (and admins) can reach the Stock Dashboard.',
      tables: [
        {
          headers: ['Role', 'Stock Dashboard', 'Other areas'],
          rows: [
            ['stock_users', '✅ Full access', 'No waiter / KDS / admin access'],
            ['admin_users', '✅ Full access (own session)', 'All existing admin access unchanged'],
            ['waiter_users', '❌ No access', 'Waiter access unchanged'],
            ['kds_users', '❌ No access', 'KDS access unchanged'],
            ['Public / guests', '❌ No access', 'Public site unchanged'],
          ],
        },
      ],
      notes: [
        'Account sign-up is closed. Only an admin can create new stock staff accounts.',
        'Ask the admin to provision a stock account if you need login access.',
      ],
    },
  ];

  return (
    <HelpLayout
      title="Stock & Waste Help"
      subtitle="A guide to the Stock & Waste Dashboard — inventory tracking, waste recording, and audit history."
      backTo="/stock-dashboard"
      backLabel="Back to Stock"
      sections={sections}
      footerNote="Need a stock staff account? Ask the restaurant admin to create one for you. Sign-up is closed by default for security."
    />
  );
}
