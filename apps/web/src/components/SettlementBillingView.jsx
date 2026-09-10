import React, { useEffect, useState } from "react";
import { billingApi } from "@/lib/billingApi.js";
import useFiscalBilling from "@/hooks/useFiscalBilling.js";
import FiscalBillingControls from "@/components/FiscalBillingControls.jsx";
import FiscalReceiptDialog from "@/components/FiscalReceiptDialog.jsx";
import FiscalSettings from "@/components/FiscalSettings.jsx";
import {Card, CardContent, CardHeader, CardTitle, CardDescription} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Receipt, Table2, Loader2, RefreshCw} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function SettlementBillingView() {
  const fiscal = useFiscalBilling();
  const [settlements, setSettlements] = useState([]);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true,
      timer;
    async function refresh() {
      setRefreshing(true);
      try {
        const data = await billingApi("/settlements");
        if (active) {
          setSettlements(data.settlements);
          setLoaded(true);
          setError("");
        }
      } catch (failure) {
        if (active) setError(failure.message);
      } finally {
        if (active) {setRefreshing(false); timer = setTimeout(refresh, 5000);}
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refreshKey]);
  const allRows = settlements.map((s) => ({ ...s, settlementId: s.id }));
  const rows = includeClosed ? allRows : allRows.filter(row => row.expand?.order?.orderStatus !== "closed");
  const hiddenMissing = !includeClosed && fiscal.transactionsLoaded ? allRows.filter(row => row.expand?.order?.orderStatus === "closed" && !["signed", "outage"].includes(fiscal.transactionFor(row)?.status)).length : 0;
  const missing = fiscal.transactionsLoaded
    ? rows.filter(
        (row) =>
          !["signed", "outage"].includes(fiscal.transactionFor(row)?.status),
      ).length
    : 0;
  const statusBadge = row => <Badge variant="outline" className={`font-bold text-[10px] shrink-0 ${row.expand?.order?.orderStatus === "closed" ? "bg-slate-100 text-slate-600 border-slate-300" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"}`}>{row.expand?.order?.orderStatus === "closed" ? "Closed" : "Open"}</Badge>;
  const orderLink = row => <button type="button" aria-label={`View settlement for ${row.orderId}`} aria-haspopup="dialog" className="text-left font-mono font-bold text-primary text-xs notranslate rounded-sm underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected(row)}>{row.orderId}<span className="block mt-1 font-normal text-muted-foreground text-[10px]">{row.settlementNumber || row.id}</span></button>;
  const confirmed = row => new Date(row.created).toLocaleString(undefined, {dateStyle:"short",timeStyle:"short"});
  return (
    <section className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Receipt className="h-5 w-5 text-primary"/></div>
          <div><h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Billing</h2><p className="text-sm text-muted-foreground">Generate and print a separate receipt for each confirmed payment.</p></div>
        </div>
        <Button variant="outline" disabled={refreshing} className="h-10 w-full sm:w-auto" onClick={() => {setRefreshKey(value => value + 1); void fiscal.refresh();}}>{refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCw className="h-4 w-4 mr-2"/>}Refresh</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeClosed} onChange={event => setIncludeClosed(event.target.checked)}/>Include closed orders for billing and reprints</label>
      <FiscalSettings config={fiscal.configuration} />
      {hiddenMissing > 0 && <p role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">{hiddenMissing} paid settlement(s) on closed orders still await receipts. <button type="button" className="underline font-semibold" onClick={() => setIncludeClosed(true)}>Include closed orders</button></p>}
      {(error || fiscal.error) && (
        <p role="alert" className="text-red-700">
          {error || fiscal.error}
        </p>
      )}
      {missing > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"
        >
          Paid settlement awaiting receipt: {missing}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[{label:"Settlements",value:rows.length,style:"border-border text-primary"},{label:"Awaiting receipt",value:missing,style:"border-amber-300 text-amber-600"},{label:"Receipts issued",value:rows.length-missing,style:"border-emerald-300 text-emerald-600"}].map(card => <Card key={card.label} className={`border-2 rounded-2xl ${card.style}`}><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">{card.label}</p><p className="text-2xl font-bold mt-2">{loaded && fiscal.transactionsLoaded ? card.value : "—"}</p></CardContent></Card>)}
      </div>
      <Card className="border-2 border-border rounded-2xl overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-base font-bold">{includeClosed ? "All Payment Settlements" : "Open / Active Order Settlements"}</CardTitle><CardDescription className="text-sm">{loaded ? `${rows.length} settlement(s)${includeClosed ? ", including closed orders" : " for open orders"}.` : "Loading…"}</CardDescription></CardHeader>
        <CardContent className="p-0">
          {!loaded ? <div className="flex justify-center py-16">{error ? <p className="text-sm text-muted-foreground">Unable to load settlements. Use Refresh to retry.</p> : <Loader2 className="h-6 w-6 animate-spin text-primary"/>}</div> : !rows.length ? <div className="flex flex-col items-center justify-center py-16 text-center px-4"><Receipt className="h-10 w-10 text-muted-foreground/40 mb-3"/><p className="text-sm text-muted-foreground">{includeClosed ? "No payment settlements yet. Confirm a payment in the Waiter UI to create one." : "No settlements for open orders. Include closed orders to view previous payments and reprints."}</p></div> : <>
            <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr className="text-left">{["Order / Settlement","Table","Paid Amount","Confirmed","Order Status","Payment Type","Cash Register","Generation Status","Print","Action"].map(label => <th key={label} className={`px-4 py-3 font-semibold ${label === "Action" ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{rows.map(row => <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">{orderLink(row)}</td><td className="px-4 py-3"><span className="flex items-center gap-1.5 font-semibold"><Table2 className="h-3.5 w-3.5 text-muted-foreground"/>{row.tableNumber}</span></td>
                <td className="px-4 py-3 font-semibold tabular-nums">€{Number(row.amount).toFixed(2)}</td><td className="px-4 py-3 text-muted-foreground">{confirmed(row)}</td><td className="px-4 py-3">{statusBadge(row)}</td>
                {["payment","register","status","print","action"].map(part => <td key={part} className="px-4 py-3"><div className={part === "action" ? "flex justify-end" : ""}><FiscalBillingControls order={row} fiscal={fiscal} part={part}/></div></td>)}
              </tr>)}</tbody></table></div>
            <div className="md:hidden divide-y divide-border">{rows.map(row => <div key={row.id} className="p-4 space-y-3"><div className="flex items-start justify-between gap-3">{orderLink(row)}{statusBadge(row)}</div><div className="flex justify-between gap-2 text-sm"><span className="flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5"/>{row.tableNumber}</span><span className="font-semibold">€{Number(row.amount).toFixed(2)}</span></div><p className="text-xs text-muted-foreground">Confirmed: {confirmed(row)}</p><div className="grid grid-cols-2 gap-3">{["payment","register","status"].map(part => <div key={part}><p className="text-xs text-muted-foreground mb-1">{part === "payment" ? "Payment Type" : part === "register" ? "Cash Register" : "Generation Status"}</p><FiscalBillingControls order={row} fiscal={fiscal} part={part}/></div>)}</div><div className="flex flex-wrap items-start justify-between gap-2 border-t border-border pt-3"><FiscalBillingControls order={row} fiscal={fiscal} part="print"/><FiscalBillingControls order={row} fiscal={fiscal} part="action"/></div></div>)}</div>
          </>}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Settlement items</DialogTitle>
            <DialogDescription>
              {selected?.orderId} / {selected?.settlementNumber || selected?.id}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div>
              {selected.items.map((item, index) => (
                <p key={index} className="py-2 border-b">
                  {item.quantity} × {item.name || item.nameEN} — €
                  {(item.quantity * item.price).toFixed(2)}
                </p>
              ))}
              <p className="my-3 font-semibold">
                Total: €{Number(selected.amount).toFixed(2)}
              </p>
              <Button onClick={() => setSelected(null)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <FiscalReceiptDialog
        transaction={fiscal.preview}
        onClose={() => fiscal.setPreview(null)}
      />
    </section>
  );
}
