import React, { useState } from 'react';
import { FileText, Database } from 'lucide-react';
import LogsManagement from '@/components/LogsManagement.jsx';
import AdminDataExplorer from '@/components/AdminDataExplorer.jsx';

/**
 * Admin Logs tab — hosts the existing System Logs view plus the read-only
 * Data Explorer for retrieving/exporting all application database data.
 * Both views are admin-only (the surrounding route is ProtectedAdminRoute).
 */
export default function AdminLogsTab() {
  const [view, setView] = useState('logs');

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Sub-navigation within the Logs tab */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          onClick={() => setView('logs')}
          className={`flex items-center px-4 py-2 text-sm font-bold rounded-lg transition-all ${
            view === 'logs'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <FileText className="h-4 w-4 mr-2" /> System Logs
        </button>
        <button
          onClick={() => setView('explorer')}
          className={`flex items-center px-4 py-2 text-sm font-bold rounded-lg transition-all ${
            view === 'explorer'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <Database className="h-4 w-4 mr-2" /> Data Explorer
        </button>
      </div>

      {view === 'logs' ? <LogsManagement /> : <AdminDataExplorer />}
    </div>
  );
}
