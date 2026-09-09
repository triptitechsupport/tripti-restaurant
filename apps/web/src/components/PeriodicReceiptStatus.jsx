import React, {useEffect, useState} from 'react';
import {billingApi} from '@/lib/billingApi.js';
import {Button} from '@/components/ui/button';

const date = seconds => seconds ? new Date(seconds * 1000).toLocaleString('de-AT', {timeZone: 'Europe/Vienna'}) : '—';
export default function PeriodicReceiptStatus({config}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const enabled = config?.enabled && config?.readiness?.ready !== false;
  useEffect(() => {
    let active = true, timer;
    setData(null); setError('');
    if (!enabled) return;
    async function check() {
      setBusy(true);
      try { const result = await billingApi('/periodic-receipts'); if (active) {setData(result); setError('');} }
      catch (failure) { if (active) setError(failure.message); }
      finally { if (active) {setBusy(false); timer = setTimeout(check, 60000);} }
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [enabled, config?.registerId, config?.environment, refresh]);
  if (!enabled) return null;
  const failed = data?.receipts.filter(receipt => receipt.status === 'FAILED').length || 0;
  const unreported = data?.receipts.filter(receipt => receipt.status === 'NOT_REPORTED').length || 0;
  return <details className="w-full rounded-lg border p-3">
    <summary className="cursor-pointer font-medium">Periodic receipt validation — {error ? 'Check unavailable' : !data ? 'Checking…' : failed ? `${failed} failed` : !data.monthlyEnabled || !data.yearlyEnabled ? 'Review configuration' : unreported ? `${unreported} not reported` : 'View results'}</summary>
    <div className="mt-3 space-y-2 text-sm">
      <p>Fiskaly creates periodic receipts automatically. This view checks existing receipts every minute while RKSV Diagnostics is open.</p>
      {error && <p role="alert" className="text-red-700">{error} Results below may be outdated.</p>}
      {data && <>
        <p>Last checked: {new Date(data.checkedAt).toLocaleString('de-AT', {timeZone: 'Europe/Vienna'})} (Vienna)</p>
        <p>Automatic validation: monthly {data.monthlyEnabled ? 'enabled' : 'disabled or unavailable'} · yearly {data.yearlyEnabled ? 'enabled' : 'disabled or unavailable'}</p>
        {(!data.monthlyEnabled || !data.yearlyEnabled) && <p role="alert" className="text-amber-700">Review automatic validation configuration with the administrator.</p>}
        {unreported > 0 && <p>{unreported} receipt(s) have no reported validation result. This does not confirm success or failure.</p>}
        {!data.receipts.length ? <p>No monthly or yearly receipts found for this register yet.</p> :
          <div className="max-h-72 overflow-auto"><table className="w-full text-left"><thead><tr><th>Receipt</th><th>Type</th><th>Signed (Vienna)</th><th>Validation</th></tr></thead>
            <tbody>{data.receipts.map(receipt => <tr key={receipt.id} className="border-t">
              <td className="py-2">{receipt.number}</td><td>{receipt.type === 'YEARLY_CLOSE' ? 'Yearly' : 'Monthly'}</td><td>{date(receipt.signedAt)}</td>
              <td><span className={receipt.status === 'FAILED' ? 'text-red-700' : ''}>{receipt.status === 'NOT_REPORTED' ? 'Not reported' : receipt.status === 'SUCCESS' ? 'Successful' : 'Failed — review required'}</span>
                {receipt.validations.length > 0 && <details><summary>Validation history</summary>{receipt.validations.map((validation, index) => <p key={index}>{date(validation.time_validation)}: {validation.validation_result}</p>)}</details>}</td>
            </tr>)}</tbody></table></div>}
      </>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Checking…' : 'Refresh status'}</Button>
    </div>
  </details>;
}
