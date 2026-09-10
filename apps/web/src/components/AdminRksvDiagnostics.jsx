import React, {useEffect, useState} from 'react';
import {billingApi} from '@/lib/billingApi.js';
import CashRegisterSetup from '@/components/CashRegisterSetup.jsx';
import {Button} from '@/components/ui/button';
import FonAuthentication from '@/components/FonAuthentication.jsx';

export default function AdminRksvDiagnostics() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(''); setConfig(null);
    billingApi('/configuration').then(result => { if (active) setConfig(result); })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [attempt]);
  return <section className="p-4 md:p-6 space-y-4">
    <h2 className="text-xl font-bold">RKSV Diagnostics</h2>
    {error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button></div> :
      !config ? <p>Loading fiscal configuration…</p> : <>
        <p className="text-sm">Environment: {config.environment}</p>
        <FonAuthentication config={config}/>
        {!config.enabled ? <p>SIGN AT is disabled.</p> : config.readiness?.ready === false ?
          <p role="alert">{config.readiness.issues.join(' ')}</p> : <CashRegisterSetup config={config} onRefresh={async () => setConfig(await billingApi('/configuration'))}/>}
      </>}
  </section>;
}
