import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, RefreshCw, PlugZap, Settings, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import apiServerClient from '@/lib/apiServerClient.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function StatusRow({ label, value, mono }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right break-words ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function StateBadge({ state }) {
  if (!state) return <Badge variant="outline" className="text-muted-foreground">UNKNOWN</Badge>;
  const ok = String(state).toUpperCase() === 'INITIALIZED' || String(state).toUpperCase() === 'AUTHENTICATED' || String(state).toUpperCase() === 'OK';
  return (
    <Badge variant="outline" className={ok ? 'bg-emerald-100 text-emerald-800 border-emerald-400' : 'bg-amber-100 text-amber-800 border-amber-400'}>
      {String(state).toUpperCase()}
    </Badge>
  );
}

export default function AdminFiscalizationPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const authToken = pb.authStore.token;

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiServerClient.fetch('/fiscalization/status', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load fiscalization status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load fiscalization status');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await apiServerClient.fetch('/fiscalization/test-connection', { method: 'POST', headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === 'INTEGRATION_NOT_CONFIGURED') {
          toast.warning('Fiskaly is not configured yet. Add FISKALY_API_KEY and FISKALY_API_SECRET to the server environment.');
        } else {
          throw new Error(data?.message || data?.error || 'Connection test failed');
        }
      } else {
        toast.success(`Fiskaly connection OK (${data.environment || 'TEST'})`);
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSetup = async () => {
    setSettingUp(true);
    try {
      const res = await apiServerClient.fetch('/fiscalization/setup', { method: 'POST', headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === 'INTEGRATION_NOT_CONFIGURED') {
          toast.warning('Fiskaly/FinanzOnline credentials are not configured yet. Add the required env variables to the server.');
        } else {
          throw new Error(data?.message || data?.error || 'Setup failed');
        }
      } else {
        toast.success('Main POS cash register provisioned successfully');
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.message || 'Setup failed');
    } finally {
      setSettingUp(false);
    }
  };

  const env = status?.environment || 'TEST';
  const isTest = String(env).toUpperCase() === 'TEST';

  return (
    <div className="min-h-screen bg-background px-mobile py-mobile">
      <Helmet>
        <title>Fiskaly Fiscalization — Admin — Tripti Genusswelt</title>
        <meta name="description" content="Fiskaly SIGN AT fiscalization backend status and setup (TEST environment)." />
      </Helmet>

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-secondary" /> Fiskaly Fiscalization
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              SIGN AT (RKSV) backend infrastructure — post-End-Order receipt signing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isTest ? 'bg-amber-100 text-amber-800 border-amber-400' : 'bg-red-100 text-red-800 border-red-400'}>
              {isTest ? 'TEST ENVIRONMENT' : `${env} ENVIRONMENT`}
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
            </Button>
          </div>
        </div>

        {isTest && (
          <div className="flex items-start gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs font-medium">
              TEST mode is active. No real fiscal receipts are issued to FinanzOnline. Do not activate LIVE mode or use production credentials until ready.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Setup &amp; Connection</CardTitle>
            <CardDescription className="text-xs">
              Idempotent — running setup repeatedly never creates duplicate SCUs or cash registers.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={handleTestConnection} disabled={testing || settingUp} className="touch-target">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
            <Button onClick={handleSetup} disabled={testing || settingUp} variant="secondary" className="touch-target">
              {settingUp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
              Run Setup (Provision Main POS)
            </Button>
          </CardContent>
        </Card>

        {/* Connection & configuration */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Connection</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <StatusRow label="Environment" value={env} />
                <StatusRow
                  label="Fiskaly API Configured"
                  value={status?.configured ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : <XCircle className="h-4 w-4 text-destructive inline" />}
                />
                <StatusRow
                  label="FinanzOnline Configured"
                  value={status?.fonConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : <XCircle className="h-4 w-4 text-destructive inline" />}
                />
                <StatusRow label="Fiskaly Connection" value={<StateBadge state={status?.fiskalyConnection} />} />
                <StatusRow label="Organization ID" value={status?.organizationId} mono />
              </>
            )}
          </CardContent>
        </Card>

        {/* Cash register & SCU */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Main POS Cash Register</CardTitle>
          </CardHeader>
          <CardContent>
            {status?.cashRegister ? (
              <>
                <StatusRow label="Name" value={status.cashRegister.name} />
                <StatusRow label="Description" value={status.cashRegister.description} />
                <StatusRow label="Fiskaly Register ID" value={status.cashRegister.id} mono />
                <StatusRow label="Serial Number" value={status.cashRegister.serialNumber} mono />
                <StatusRow label="Register State" value={<StateBadge state={status.cashRegister.status} />} />
                <StatusRow label="SCU ID" value={status.scu?.id} mono />
                <StatusRow label="SCU State" value={<StateBadge state={status.scu?.status} />} />
                <StatusRow label="SCU Certificate" value={status.scu?.certificateSerialNumber} mono />
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                No Main POS cash register provisioned yet. Run setup to create one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* FinanzOnline */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">FinanzOnline (FON)</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusRow label="FON Authentication" value={<StateBadge state={status?.fonStatus} />} />
          </CardContent>
        </Card>

        {/* Last fiscal receipt */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary flex items-center gap-2">
              <Receipt className="h-4 w-4 text-secondary" /> Last Fiscal Receipt
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status?.lastFiscalReceipt ? (
              <>
                <StatusRow label="Order" value={status.lastFiscalReceipt.orderNumber || status.lastFiscalReceipt.orderId} mono />
                <StatusRow label="Receipt Number" value={status.lastFiscalReceipt.receiptNumber} mono />
                <StatusRow label="Receipt Type" value={status.lastFiscalReceipt.receiptType} />
                <StatusRow label="Total" value={`€${Number(status.lastFiscalReceipt.totalAmount || 0).toFixed(2)}`} />
                <StatusRow label="Payment Type" value={status.lastFiscalReceipt.paymentType} />
                <StatusRow label="Status" value={<StateBadge state={status.lastFiscalReceipt.status} />} />
                {status.lastFiscalReceipt.errorMessage ? (
                  <StatusRow label="Error" value={status.lastFiscalReceipt.errorMessage} />
                ) : null}
                <StatusRow label="Signed At" value={status.lastFiscalization ? new Date(status.lastFiscalization).toLocaleString() : '—'} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No receipts fiscalized yet.</p>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          Fiskaly credentials are stored server-side only and are never exposed to the browser. Payment and fiscalization states are maintained separately.
        </p>
      </div>
    </div>
  );
}
