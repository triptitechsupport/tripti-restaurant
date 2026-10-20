import React from "react";
import { Button } from "@/components/ui/button";
import { fiscalStatusLabel, paymentOptions } from "@/hooks/useFiscalBilling.js";
import { useLanguage } from "@/contexts/LanguageContext.jsx";
import { billingText } from "@/lib/billingText.js";
export default function FiscalBillingControls({ order, fiscal, part }) {
  const { language } = useLanguage();
  const b = billingText(language);
  const t = fiscal.transactionFor(order);
  const issued = ["signed", "outage"].includes(t?.status);
  const cancellation = fiscal.transactions.find(
    (c) => c.originalTransaction === t?.id && c.status !== "superseded",
  );
  const released = fiscal.transactions.filter(c => (order.settlementId ? c.settlement === order.settlementId : c.order === order.id && !c.settlement) && c.status === "superseded");
  if (part === "action" && fiscal.readOnly) return null;
  const canRecover = receipt => receipt?.status === "failed" && receipt.failureDetails?.recoverable && !receipt.fallbackReceipt;
  if (part === "register") {
    const rows = fiscal.configuration?.registers || [];
    const selected = fiscal.registerFor(order);
    return <select aria-label={`Cash register for ${order.settlementNumber || order.orderId}`}
      className="border rounded-md bg-background p-2 text-xs max-w-48" value={selected}
      disabled={Boolean(t) || fiscal.readOnly || fiscal.busy === order.id}
      onChange={e => fiscal.setRegisterChoices(prev => ({...prev, [order.id]: e.target.value}))}>
      <option value="">{b("Select register")}</option>
      {selected && !rows.some(r => r.id === selected) && <option value={selected}>{b("Original register")}</option>}
      {rows.map(r => <option key={r.id} value={r.id} disabled={!r.enabledForBilling}>{r.name}{r.enabledForBilling ? '' : ` — ${b('setup required')}`}</option>)}
    </select>;
  }
  if (part === "payment")
    return (
      <select
        aria-label={`Payment type for ${order.orderId}`}
        className="border rounded-md bg-background p-2 text-xs"
        value={fiscal.paymentFor(order)}
        disabled={Boolean(t) || fiscal.readOnly || fiscal.busy === order.id}
        onChange={(e) =>
          fiscal.setPayments((prev) => ({
            ...prev,
            [order.id]: e.target.value,
          }))
        }
      >
        {paymentOptions.map((p) => (
          <option key={p} value={p}>
            {p.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    );
  if (part === "status")
    return (
      <div className="text-xs">
        <span
          className={
            t?.status === "failed"
              ? "text-red-600"
              : issued
                ? "text-emerald-600"
                : "text-amber-600"
          }
        >
          {b(fiscalStatusLabel(t))}
        </span>
        {t?.errorMessage && (
          <p className="text-red-600 max-w-52 mt-1">{t.errorMessage}</p>
        )}
        {t?.status === "failed" && !canRecover(t) && <p className="max-w-52 mt-1">{b("Resolve the reported issue, then retry the saved receipt. It cannot be released while its outcome is uncertain or an outage copy exists.")}</p>}
        {cancellation && <p>{b("Cancellation")}: {b(fiscalStatusLabel(cancellation))}{cancellation.errorMessage && ` — ${cancellation.errorMessage}`}</p>}
        {released.length > 0 && <details className="mt-2 max-w-56"><summary className="cursor-pointer">{b("Released attempts")} ({released.length})</summary>{released.map(receipt => <p key={receipt.id} className="mt-1">{receipt.receiptType} · {new Date(receipt.recoveryDetails.recoveredAt).toLocaleString()} · {receipt.recoveryDetails.reason}</p>)}</details>}
      </div>
    );
  if (part === "print")
    return (
      <div className="flex flex-col gap-1">
        {(issued || !t?.fallbackReceipt) && (
          <Button
            size="sm"
            variant="outline"
            disabled={!issued}
            onClick={() => fiscal.setPreview(t)}
          >
            {b("Print")}
          </Button>
        )}
        {t?.fallbackReceipt && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              fiscal.setPreview({ ...t, printVariant: "fallback" })
            }
          >
            {b(issued ? "Print outage copy" : "Print outage receipt")}
          </Button>
        )}
        {cancellation && ["signed", "outage"].includes(cancellation.status) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => fiscal.setPreview(cancellation)}
          >
            {b("Print cancellation")}
          </Button>
        )}
        {cancellation?.fallbackReceipt && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              fiscal.setPreview({ ...cancellation, printVariant: "fallback" })
            }
          >
            {b("Print cancellation outage copy")}
          </Button>
        )}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {!t && (
        <Button
          size="sm"
          disabled={fiscal.busy === order.id || Boolean(fiscal.error) || (order.settlementId && !fiscal.registerFor(order))}
          onClick={() => fiscal.generate(order)}
        >
          {b(fiscal.busy === order.id ? "Generating…" : "Generate Bill")}
        </Button>
      )}
      {t && ["failed", "queued"].includes(t.status) && (
        <Button
          size="sm"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.retry(t)}
        >
          {b("Retry generation")}
        </Button>
      )}
      {!fiscal.limited && canRecover(t) && <Button size="sm" variant="outline" disabled={fiscal.busy === order.id || Boolean(fiscal.error)} onClick={() => fiscal.recover(t)}>{b("Release rejected bill")}</Button>}
      {!fiscal.limited && issued && !cancellation && (
        <Button
          size="sm"
          variant="outline"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.cancel(t)}
        >
          {b("Cancel receipt")}
        </Button>
      )}
      {cancellation && ["failed", "queued"].includes(cancellation.status) && (
        <Button
          size="sm"
          variant="outline"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.retry(cancellation)}
        >
          {b("Retry cancellation")}
        </Button>
      )}
      {canRecover(cancellation) && <Button size="sm" variant="outline" disabled={fiscal.busy === order.id || Boolean(fiscal.error)} onClick={() => fiscal.recover(cancellation)}>{b("Release rejected cancellation")}</Button>}
    </div>
  );
}
