import React, {useRef, useState} from 'react';
import {billingApi} from '@/lib/billingApi.js';
import {Button} from '@/components/ui/button';
import PeriodicReceiptStatus from '@/components/PeriodicReceiptStatus.jsx';

export default function CashRegisterSetup({config, onRefresh}) {
  const [name, setName] = useState('');
  const [registerId, setRegisterId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState('');
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState('');
  const ready = config.readiness?.ready;
  const rows = config.registers || [];
  const selectedRow = rows.find(r => r.id === selected);
  async function run(key, fn) {
    if (pending.current) return;
    pending.current = true; setBusy(key); setError(''); setMessage('');
    try { await fn(); await onRefresh(); }
    catch (e) { setError(e.message); await onRefresh(); }
    finally { pending.current = false; setBusy(''); }
  }
  async function add(useConfigured = false) {
    await run('add', async () => {
      const result = await billingApi('/registers', {name: useConfigured ? 'Main counter' : name,
        registerId: useConfigured ? config.registerId : registerId});
      setSelected(result.register.id); setMessage('Register saved. Use Complete setup or Refresh existing register.');
      if (!useConfigured) {setName(''); setRegisterId(crypto.randomUUID());}
    });
  }
  async function action(row, kind) {
    await run(row.id, async () => {
      const result = await billingApi(`/registers/${row.id}/${kind}`, {});
      setMessage(kind === 'default' ? 'Default register saved.' : result.register.enabledForBilling ? 'Register is ready for billing.' : 'Status updated. Review the state and initial validation below.');
    });
  }
  return <section className="rounded-xl border border-border p-4 space-y-4">
    <h3 className="font-semibold">SCU and cash register setup</h3>
    <p className="text-sm">Complete setup authenticates FON when needed, creates and initializes the configured SCU, registers and initializes this cash register, and enables periodic validations. It resumes existing resources using the same IDs.</p>
    <p className="text-xs text-muted-foreground break-all">Shared SCU: {config.scuId || 'Set FISKALY_SCU_ID in the server environment first.'}</p>
    <p className="text-sm">Use the same merchant organization and environment for all registers. Creating a new register requires a new Fiskaly UUID; adding an existing register requires its original UUID.</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Cash register name" placeholder="Name, e.g. Terrace counter" className="border rounded-md bg-background p-2" value={name} onChange={e => setName(e.target.value)} disabled={Boolean(busy)}/>
      <input aria-label="Fiskaly cash register UUID" className="border rounded-md bg-background p-2 min-w-72" value={registerId} onChange={e => setRegisterId(e.target.value)} disabled={Boolean(busy)}/>
      <Button disabled={!ready || Boolean(busy) || !name.trim()} onClick={() => add()}>Add register</Button>
      <Button variant="outline" disabled={!ready || Boolean(busy) || !config.registerId} onClick={() => add(true)}>Add configured register</Button>
    </div>
    {error && <p role="alert" className="text-destructive">{error} If setup was interrupted, resume setup on the saved register.</p>}
    {message && <p role="status">{message}</p>}
    <div className="space-y-3">{rows.map(row => <div key={row.id} className="rounded-lg border p-3 space-y-2">
      <p className="font-semibold">{row.name}{row.isDefault ? ' · Default' : ''}</p>
      <p className="text-xs break-all">{row.fiskalyCashRegisterId}</p>
      <p className="text-sm">Register: {row.status || 'Not checked'} · SCU: {row.scuStatus || 'Not checked'} · Initial validation: {row.initialValidation || 'Not checked'}</p>
      <p className="text-sm">{row.enabledForBilling ? 'Available in Billing' : 'Not ready for billing'}</p>
      {config.environment === 'TEST' && row.initialValidation === 'NOT_REPORTED' && <p className="text-xs">TEST validation has no reported result. LIVE billing requires a successful initial validation.</p>}
      {row.setupError && <p className="text-sm text-destructive">{row.setupError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!ready || Boolean(busy)} onClick={() => action(row, 'setup')}>{busy === row.id ? 'Working…' : 'Complete / resume setup'}</Button>
        <Button variant="outline" disabled={!ready || Boolean(busy)} onClick={() => action(row, 'refresh')}>Refresh existing register</Button>
        <Button variant="outline" disabled={!ready || Boolean(busy) || row.status !== 'INITIALIZED'} onClick={() => action(row, 'validate-initial')}>Validate initial receipt</Button>
        <Button variant="outline" disabled={!row.enabledForBilling || Boolean(busy) || row.isDefault} onClick={() => action(row, 'default')}>Make default</Button>
        <Button variant="outline" onClick={() => setSelected(row.id)}>View periodic receipts</Button>
      </div>
    </div>)}</div>
    {selectedRow && <div><p className="font-semibold">Periodic receipts — {selectedRow.name}</p><PeriodicReceiptStatus key={selectedRow.id} config={{...config, registerId: selectedRow.fiskalyCashRegisterId, cashRegisterId: selectedRow.id}}/></div>}
  </section>;
}
