import React, {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {billingApi} from '@/lib/billingApi.js';
import {toast} from 'sonner';

export default function FiscalSettings({config}) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const registerId = selected || config?.registers?.find(r => r.isDefault)?.id || config?.registers?.[0]?.id || '';

  async function downloadDep7() {
    setBusy(true);
    try {
      const data = await billingApi(`/dep7?cashRegisterId=${encodeURIComponent(registerId)}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = `dep7-${config?.registers?.find(r => r.id === registerId)?.fiskalyCashRegisterId || registerId}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Register for DEP7 export" className="border rounded-md bg-background p-2 text-sm" value={registerId} onChange={e => setSelected(e.target.value)}>
      <option value="">Select register for export</option>
      {(config?.registers || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
    <Button size="sm" variant="outline" disabled={busy || !registerId || !config?.enabled || config?.readiness?.ready === false} onClick={downloadDep7}>
      {busy ? 'Downloading DEP7…' : 'Download DEP7'}
    </Button>
    {config?.environment === 'TEST' && <Badge variant="outline">TEST</Badge>}
    {config?.environment === 'LIVE' && <Badge variant="outline">{config?.readiness?.ready ? 'LIVE' : 'LIVE blocked'}</Badge>}
  </div>;
}
