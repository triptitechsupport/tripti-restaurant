import React, {useEffect, useRef, useState} from 'react';
import {billingApi} from '@/lib/billingApi.js';
import {Button} from '@/components/ui/button';

export default function FonAuthentication({config}) {
  const [status, setStatus] = useState('Not checked');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ready = config.enabled && config.readiness?.ready;
  async function run(authenticate) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setStatus('Checking…');
    try {
      if (authenticate) await billingApi('/setup/authenticate-fon', {});
      const result = await billingApi('/fon/status');
      if (mounted.current) setStatus(result.authenticationStatus);
    } catch (failure) {
      if (mounted.current) { setError(failure.message); setStatus('Check unavailable'); }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <section className="rounded-xl border border-border p-4 space-y-3">
    <h3 className="font-semibold">FinanzOnline (FON)</h3>
    <p className="text-sm">Authenticate using the cash-register web service credentials configured on the server.</p>
    <p className="text-sm" role="status">Status: {status}</p>
    {!config.fonCredentialsConfigured && <p className="text-sm">To authenticate, configure FON_PARTICIPANT_ID, FON_USER_ID and FON_PIN in the server environment.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!ready || !config.fonCredentialsConfigured || busy} onClick={() => run(true)}>Authenticate FON</Button>
      <Button variant="outline" disabled={!ready || busy} onClick={() => run(false)}>Refresh status</Button>
    </div>
  </section>;
}
