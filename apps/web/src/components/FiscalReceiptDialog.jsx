import React from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {fiscalPrintModel} from '@/lib/fiscalPrintModel.js';
import '@/styles/fiscal-receipt.css';

const money = value => new Intl.NumberFormat('de-AT', {style: 'currency', currency: 'EUR'}).format(Number(value));

function ReceiptRow({label, children}) {
  return <div className="fiscal-row"><span>{label}</span><span>{children}</span></div>;
}

export default function FiscalReceiptDialog({transaction, onClose}) {
  const t = fiscalPrintModel(transaction);
  if (!t) return null;
  const response = t.responsePayload || {};
  const snapshot = t.receiptSnapshot || {};
  const company = snapshot.company || {};
  const printable = ['signed', 'outage', 'fallback'].includes(t.status) && Boolean(t.qrCodeData);
  const signedDate = t.signedAt ? new Date(t.signedAt) : null;
  const validDate = signedDate && !Number.isNaN(signedDate.getTime());
  const title = t.receiptType === 'CANCELLATION' ? 'CANCELLATION / STORNO' : t.receiptType === 'TRAINING' ? 'TRAINING / SCHULUNG' : 'RECEIPT / BELEG';

  function printReceipt() {
    document.body.classList.add('printing-fiscal-receipt');
    const cleanup = () => document.body.classList.remove('printing-fiscal-receipt');
    window.addEventListener('afterprint', cleanup, {once: true});
    try { window.print(); } catch (error) { cleanup(); throw error; }
  }

  return <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader className="fiscal-no-print">
        <DialogTitle>{t.isFallback ? 'Outage receipt preview' : 'Receipt preview'}</DialogTitle>
        <DialogDescription>{t.isFallback ? 'Prints the saved outage copy. Signing is retried automatically; this copy remains available afterward.' : 'Prints the saved receipt. Reprints do not generate another receipt.'}</DialogDescription>
      </DialogHeader>
      <div className="fiscal-receipt notranslate" id="fiscal-receipt" translate="no">
        {response._env !== 'LIVE' && <div className="fiscal-test-notice">TEST RECEIPT<br/>NOT FOR ACCOUNTING</div>}
        <header className="fiscal-company">
          <h2>{company.name}</h2>
          <p className="fiscal-address">{company.address}</p>
          <p>UID: {company.vatId}</p>
        </header>
        <h3 className="fiscal-title">{title}</h3>
        <section className="fiscal-meta">
          {t.isFallback
            ? <ReceiptRow label="Local reference">{t.localReference}</ReceiptRow>
            : <ReceiptRow label="Receipt No."><strong>{t.fiskalyReceiptNumber}</strong></ReceiptRow>}
          <ReceiptRow label="Order ID">{t.orderId}</ReceiptRow>
          {t.receiptSnapshot?.settlementId && <ReceiptRow label="Settlement">{t.receiptSnapshot.settlementNumber || t.receiptSnapshot.settlementId}</ReceiptRow>}
            <ReceiptRow label="Date / Time">
              <span style={{ whiteSpace: "nowrap" }}>
              {validDate
                ? `${signedDate.toLocaleDateString("de-AT", {
                    timeZone: "Europe/Vienna",
                  })} ${signedDate.toLocaleTimeString("de-AT", {
                    timeZone: "Europe/Vienna",
                  })}`
                : "—"}
              </span>
            </ReceiptRow>
        </section>
        <hr/>
        <section>
          <div className="fiscal-row fiscal-caption"><span>ITEM / ARTIKEL</span><span>EUR</span></div>
          {(snapshot.lines || []).map((line, i) => <div key={i} className="fiscal-item">
            <div className="fiscal-item-name">{line.text}</div>
            <ReceiptRow label={`${line.quantity} × ${money(line.price_per_unit)} · ${line.vatPercent}% VAT`}>
              {money(Math.round(Number(line.price_per_unit) * 100) * Number(line.quantity) / 100)}
            </ReceiptRow>
          </div>)}
        </section>
        <div className="fiscal-total"><span>TOTAL / SUMME</span><span>{money(t.amount)}</span></div>
        <ReceiptRow label="Payment"><strong>{t.paymentType}</strong></ReceiptRow>
        <section className="fiscal-vat">
          <div className="fiscal-row fiscal-caption"><span>VAT / MWST.</span><span>GROSS / BRUTTO</span></div>
          {(snapshot.vatTotals || []).map(entry => {
            const line = (snapshot.lines || []).find(item => item.vatRate === entry.vat_rate);
            return <ReceiptRow key={entry.vat_rate} label={line?.vatPercent != null ? `${line.vatPercent}%` : entry.vat_rate}>{money(entry.amount)}</ReceiptRow>;
          })}
        </section>
        {snapshot.cancellationReason && <p className="fiscal-notice">Cancellation reason: {snapshot.cancellationReason}</p>}
        {(response.hints || []).map((hint, i) => <p key={i} className="fiscal-notice">{hint}</p>)}
        <hr/>
        {!t.isFallback && <ReceiptRow label="Cash register">{response.cash_register_serial_number}</ReceiptRow>}
        {printable && <div className="fiscal-qr"><QRCodeSVG value={t.qrCodeData} size={180} level="M" marginSize={4}/></div>}
        <footer className="fiscal-footer">
          <p>{t.isFallback ? 'Outage receipt / Ausfallbeleg' : 'Fiscal Receipt / Fiskalbeleg'}</p>
          <strong>{t.isFallback ? 'Sicherheitseinrichtung ausgefallen' : t.status === 'signed' ? 'SIGNED / SIGNIERT' : t.status === 'outage' ? 'SECURITY DEVICE OUTAGE' : 'NOT READY FOR PRINT'}</strong>
        </footer>
      </div>
      <div className="fiscal-no-print flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
        <Button className="flex-1" disabled={!printable} onClick={printReceipt}>Print receipt</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
