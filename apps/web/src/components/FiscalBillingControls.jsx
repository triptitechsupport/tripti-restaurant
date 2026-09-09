import React from "react";
import { Button } from "@/components/ui/button";
import { fiscalStatusLabel, paymentOptions } from "@/hooks/useFiscalBilling.js";
export default function FiscalBillingControls({ order, fiscal, part }) {
  const t = fiscal.transactionFor(order);
  const issued = ["signed", "outage"].includes(t?.status);
  const cancellation = fiscal.transactions.find(
    (c) => c.originalTransaction === t?.id && c.status !== "superseded",
  );
  const released = fiscal.transactions.filter(c => (order.settlementId ? c.settlement === order.settlementId : c.order === order.id && !c.settlement) && c.status === "superseded");
  const canRecover = receipt => receipt?.status === "failed" && receipt.failureDetails?.recoverable && !receipt.fallbackReceipt;
  if (part === "payment")
    return (
      <select
        aria-label={`Payment type for ${order.orderId}`}
        className="border rounded-md bg-background p-2 text-xs"
        value={fiscal.paymentFor(order)}
        disabled={Boolean(t) || fiscal.busy === order.id}
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
          {fiscalStatusLabel(t)}
        </span>
        {t?.errorMessage && (
          <p className="text-red-600 max-w-52 mt-1">{t.errorMessage}</p>
        )}
        {t?.status === "failed" && !canRecover(t) && <p className="max-w-52 mt-1">Resolve the reported issue, then retry the saved receipt. It cannot be released while its outcome is uncertain or an outage copy exists.</p>}
        {cancellation && <p>Cancellation: {fiscalStatusLabel(cancellation)}{cancellation.errorMessage && ` — ${cancellation.errorMessage}`}</p>}
        {released.length > 0 && <details className="mt-2 max-w-56"><summary className="cursor-pointer">Released attempts ({released.length})</summary>{released.map(receipt => <p key={receipt.id} className="mt-1">{receipt.receiptType} · {new Date(receipt.recoveryDetails.recoveredAt).toLocaleString()} · {receipt.recoveryDetails.reason}</p>)}</details>}
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
            Print
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
            {issued ? "Print outage copy" : "Print outage receipt"}
          </Button>
        )}
        {cancellation && ["signed", "outage"].includes(cancellation.status) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => fiscal.setPreview(cancellation)}
          >
            Print cancellation
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
            Print cancellation outage copy
          </Button>
        )}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {!t && (
        <Button
          size="sm"
          disabled={fiscal.busy === order.id || Boolean(fiscal.error)}
          onClick={() => fiscal.generate(order)}
        >
          {fiscal.busy === order.id ? "Generating…" : "Generate Bill"}
        </Button>
      )}
      {t && ["failed", "queued"].includes(t.status) && (
        <Button
          size="sm"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.retry(t)}
        >
          Retry generation
        </Button>
      )}
      {canRecover(t) && <Button size="sm" variant="outline" disabled={fiscal.busy === order.id || Boolean(fiscal.error)} onClick={() => fiscal.recover(t)}>Release rejected bill</Button>}
      {issued && !cancellation && (
        <Button
          size="sm"
          variant="outline"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.cancel(t)}
        >
          Cancel receipt
        </Button>
      )}
      {cancellation && ["failed", "queued"].includes(cancellation.status) && (
        <Button
          size="sm"
          variant="outline"
          disabled={fiscal.busy === order.id}
          onClick={() => fiscal.retry(cancellation)}
        >
          Retry cancellation
        </Button>
      )}
      {canRecover(cancellation) && <Button size="sm" variant="outline" disabled={fiscal.busy === order.id || Boolean(fiscal.error)} onClick={() => fiscal.recover(cancellation)}>Release rejected cancellation</Button>}
    </div>
  );
}
