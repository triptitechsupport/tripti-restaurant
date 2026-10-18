import React, { useState, useRef, useCallback } from 'react';
import {
  Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import {
  recordsToCsv, parseCsv, buildFieldResolver, downloadCsv,
} from '@/lib/csvUtils.js';

/**
 * Reusable CSV export/import control for Admin data pages.
 *
 * Props:
 *  - collection: PocketBase collection name (used for default fetch + upsert)
 *  - entityLabel: human label, e.g. "menu items" (used in toasts/dialog)
 *  - exportFileName: download file name
 *  - exportColumns: [{ key, label?, format?(value, record) }]
 *  - importConfig (optional; omit for export-only):
 *      {
 *        idField: 'id',
 *        matchFields: ['nameEN'],          // alt unique keys for upsert
 *        fieldMap: { 'csv alias': 'pbField', ... },
 *        required: ['nameEN'],
 *        immutableFields: ['id','created','updated'],
 *        transformers: { pbField: (raw, row) => finalValue },
 *        defaults: { pbField: value },
 *        preValidate: (payload, rawRow) => string|null,
 *      }
 *  - fetchRecords: async () => records[]   (optional override)
 *  - onImportComplete: () => void           (refresh callback)
 *  - customApply: (row) => Promise<{status:'created'|'updated', recordId}>
 *      optional per-row write override (e.g. auth collections needing
 *      passwordConfirm / auto-generated email). When provided, the default
 *      pb.collection().create/update is bypassed for valid rows.
 *  - disabled: boolean
 */
export default function CsvImportExport({
  collection,
  entityLabel = 'records',
  exportFileName = 'export.csv',
  exportColumns = [],
  importConfig = null,
  fetchRecords,
  onImportComplete,
  customApply,
  disabled = false,
}) {
  const fileInputRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);

  // Preview / result dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);     // mapped+validated rows
  const [resultOpen, setResultOpen] = useState(false);
  const [resultRows, setResultRows] = useState([]);     // final per-row outcomes
  const [summary, setSummary] = useState(null);

  const defaultFetch = useCallback(async () => {
    return await pb.collection(collection).getFullList({
      sort: '-created',
      $autoCancel: false,
    });
  }, [collection]);

  const doFetch = fetchRecords || defaultFetch;

  // ---- EXPORT ----
  const handleExport = async () => {
    if (disabled) return;
    setExporting(true);
    try {
      const records = await doFetch();
      const csv = recordsToCsv(records, exportColumns);
      downloadCsv(exportFileName, csv);
      toast.success(`Exported ${records.length} ${entityLabel} to CSV`);
    } catch (err) {
      console.error('[CsvImportExport] export failed', err);
      toast.error(`Failed to export ${entityLabel}`);
    } finally {
      setExporting(false);
    }
  };

  // ---- IMPORT: parse + map + validate ----
  const handleFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    // reset input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !importConfig) return;

    setImporting(true);
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      if (rows.length === 0) {
        toast.error('CSV file is empty or has no data rows.');
        setImporting(false);
        return;
      }

      const resolver = buildFieldResolver(importConfig.fieldMap || {});
      const resolvedHeaders = headers.map((h) => ({ raw: h, pbField: resolver(h) }));

      // Fetch existing records once for upsert matching.
      let existing = [];
      try {
        existing = await doFetch();
      } catch (err) {
        console.error('[CsvImportExport] fetch existing failed', err);
      }
      const byId = new Map();
      const byMatch = new Map();
      const idField = importConfig.idField || 'id';
      const matchFields = importConfig.matchFields || [];
      existing.forEach((rec) => {
        if (rec[idField]) byId.set(String(rec[idField]), rec);
        matchFields.forEach((mf) => {
          if (rec[mf] != null && String(rec[mf]).trim() !== '') {
            byMatch.set(`${mf}::${String(rec[mf]).trim().toLowerCase()}`, rec);
          }
        });
      });

      const immutable = new Set(importConfig.immutableFields || ['id', 'created', 'updated']);
      const required = importConfig.required || [];
      const transformers = importConfig.transformers || {};
      const defaults = importConfig.defaults || {};
      const preValidate = importConfig.preValidate;

      const mapped = rows.map((rawRow, idx) => {
        // Build raw payload from resolved headers
        const rawPayload = {};
        resolvedHeaders.forEach(({ raw, pbField }) => {
          if (!pbField) return;
          rawPayload[pbField] = rawRow[raw] !== undefined ? rawRow[raw] : '';
        });

        // Apply defaults for missing/empty cells
        Object.entries(defaults).forEach(([k, v]) => {
          if (rawPayload[k] === undefined || String(rawPayload[k]).trim() === '') {
            rawPayload[k] = v;
          }
        });

        // Apply transformers
        const payload = {};
        Object.entries(rawPayload).forEach(([k, v]) => {
          if (immutable.has(k)) return; // never write immutable fields
          if (typeof transformers[k] === 'function') {
            payload[k] = transformers[k](v, rawRow);
          } else {
            payload[k] = v;
          }
        });

        // Determine action: update if id matches, else match by unique fields, else create
        let action = 'create';
        let matchRecord = null;
        const idVal = rawPayload[idField];
        if (idVal && String(idVal).trim() !== '' && byId.has(String(idVal).trim())) {
          matchRecord = byId.get(String(idVal).trim());
          action = 'update';
        } else {
          for (const mf of matchFields) {
            const mv = rawPayload[mf];
            if (mv != null && String(mv).trim() !== '') {
              const key = `${mf}::${String(mv).trim().toLowerCase()}`;
              if (byMatch.has(key)) {
                matchRecord = byMatch.get(key);
                action = 'update';
                break;
              }
            }
          }
        }

        // For new records, merge createDefaults (e.g. auto-generate a
        // reservationCode / default paymentStatus that immutable stripping
        // removed but the schema requires on create).
        if (action === 'create' && typeof importConfig.createDefaults === 'function') {
          const extras = importConfig.createDefaults(payload, rawRow) || {};
          Object.entries(extras).forEach(([k, v]) => { payload[k] = v; });
        }

        // Validate required fields (on the final payload)
        const errors = [];
        required.forEach((f) => {
          const val = payload[f];
          if (val === undefined || val === null || String(val).trim() === '' ||
              (Array.isArray(val) && val.length === 0)) {
            errors.push(`Missing required field: ${f}`);
          }
        });
        if (typeof preValidate === 'function') {
          const customErr = preValidate(payload, rawRow);
          if (customErr) errors.push(customErr);
        }

        return {
          rowNumber: idx + 2, // +1 for header, +1 for 1-based
          action,
          matchId: matchRecord ? matchRecord[idField] : null,
          payload,
          errors,
          rawRow,
        };
      });

      setParsedRows(mapped);
      setPreviewOpen(true);
    } catch (err) {
      console.error('[CsvImportExport] parse failed', err);
      toast.error('Failed to read CSV file.');
    } finally {
      setImporting(false);
    }
  };

  // ---- IMPORT: apply upserts ----
  const handleApplyImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error('No valid rows to import. Please fix the errors and try again.');
      return;
    }
    setApplying(true);
    const outcomes = [];
    let created = 0, updated = 0, skipped = 0, failed = 0;

    for (const row of parsedRows) {
      if (row.errors.length > 0) {
        skipped++;
        outcomes.push({ ...row, status: 'skipped', message: row.errors.join('; ') });
        continue;
      }
      try {
        let rec;
        let status;
        if (typeof customApply === 'function') {
          const res = await customApply(row);
          rec = { id: res.recordId };
          status = res.status;
        } else if (row.action === 'update' && row.matchId) {
          rec = await pb.collection(collection).update(row.matchId, row.payload, {
            $autoCancel: false,
            requestKey: `csv-up-${collection}-${row.matchId}-${row.rowNumber}`,
          });
          status = 'updated';
        } else {
          rec = await pb.collection(collection).create(row.payload, {
            $autoCancel: false,
            requestKey: `csv-cr-${collection}-${row.rowNumber}`,
          });
          status = 'created';
        }
        if (status === 'updated') updated++; else created++;
        outcomes.push({ ...row, status, message: status === 'updated' ? 'Updated' : 'Created', recordId: rec.id });
      } catch (err) {
        failed++;
        const msg = err?.response?.data
          ? Object.entries(err.response.data)
              .map(([f, e]) => `${f}: ${e?.message || 'invalid'}`)
              .join('; ')
          : err?.message || 'Failed to save';
        outcomes.push({ ...row, status: 'failed', message: msg });
      }
    }

    setSummary({ created, updated, skipped, failed, total: parsedRows.length });
    setResultRows(outcomes);
    setPreviewOpen(false);
    setResultOpen(true);
    setApplying(false);
    if (created + updated > 0 && typeof onImportComplete === 'function') {
      try { onImportComplete(); } catch (_) {}
    }
  };

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = parsedRows.length - validCount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={disabled || exporting}
        className="min-h-touch shadow-sm gap-2"
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export CSV
      </Button>

      {importConfig && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || importing}
            className="min-h-touch shadow-sm gap-2"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelected}
          />
        </>
      )}

      {/* Preview / validation dialog */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!applying) setPreviewOpen(o); }}>
        <DialogContent className="max-w-5xl w-[96vw] rounded-2xl border-2 border-primary shadow-xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex flex-row items-start justify-between gap-3 border-b-2 border-border p-4 sm:p-5 bg-muted/30">
            <div>
              <DialogTitle className="text-primary text-lg sm:text-xl flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" /> Import {entityLabel}
              </DialogTitle>
              <DialogDescription className="font-medium text-muted-foreground mt-0.5">
                Review the mapped rows below. Existing records matched by ID or unique field will be updated; the rest will be created.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { if (!applying) setPreviewOpen(false); }} className="shrink-0">
                <X className="h-5 w-5" />
              </Button>
          </DialogHeader>

          <div className="px-4 sm:px-5 py-3 bg-card border-b border-border flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-primary/10 text-primary border-primary/30">{parsedRows.length} total</Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">{validCount} ready</Badge>
            {errorCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30">{errorCount} with errors</Badge>
            )}
            {errorCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Rows with errors will be skipped.
              </span>
            )}
          </div>

          <ScrollArea className="max-h-[55vh]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Match ID</th>
                    <th className="px-3 py-2 font-semibold">Payload</th>
                    <th className="px-3 py-2 font-semibold">Status / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedRows.map((r) => (
                    <tr key={r.rowNumber} className={r.errors.length ? 'bg-destructive/5' : 'hover:bg-muted/20'}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={
                          r.action === 'update'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold'
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold'
                        }>
                          {r.action === 'update' ? 'Update' : 'Create'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground break-all max-w-[120px]">
                        {r.matchId || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <pre className="font-mono text-[10px] text-foreground whitespace-pre-wrap break-words max-w-[320px]">
                          {JSON.stringify(r.payload, null, 0)}
                        </pre>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r.errors.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-destructive">
                            {r.errors.map((e, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 p-4 border-t-2 border-border bg-card">
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={applying}
              className="w-full sm:w-auto min-h-touch"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyImport}
              disabled={applying || validCount === 0}
              className="w-full sm:w-auto min-h-touch shadow-md"
            >
              {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {applying ? 'Applying…' : `Apply ${validCount} row${validCount === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result / summary dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl w-[94vw] rounded-2xl border-2 border-primary shadow-xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b-2 border-border p-4 sm:p-5 bg-muted/30">
            <DialogTitle className="text-primary text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Import Complete
            </DialogTitle>
            <DialogDescription className="font-medium text-muted-foreground">
              Summary of the {entityLabel} CSV import.
            </DialogDescription>
          </DialogHeader>

          {summary && (
            <div className="px-4 sm:px-5 py-4 grid grid-cols-4 gap-3 border-b border-border">
              <SummaryStat label="Created" value={summary.created} className="text-emerald-600" />
              <SummaryStat label="Updated" value={summary.updated} className="text-amber-600" />
              <SummaryStat label="Skipped" value={summary.skipped} className="text-muted-foreground" />
              <SummaryStat label="Failed" value={summary.failed} className={summary.failed ? 'text-destructive' : 'text-muted-foreground'} />
            </div>
          )}

          <ScrollArea className="max-h-[40vh]">
            <div className="divide-y divide-border">
              {resultRows.map((r) => (
                <div key={r.rowNumber} className="px-4 sm:px-5 py-2 flex items-center gap-3 text-xs">
                  <span className="font-mono text-muted-foreground w-10 shrink-0">#{r.rowNumber}</span>
                  <Badge variant="outline" className={
                    r.status === 'created' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold'
                    : r.status === 'updated' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold'
                    : r.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/30 font-bold'
                    : 'bg-muted text-muted-foreground border-border font-bold'
                  }>
                    {r.status}
                  </Badge>
                  <span className="text-foreground break-words">{r.message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="p-4 border-t-2 border-border bg-card">
            <Button onClick={() => setResultOpen(false)} className="w-full sm:w-auto min-h-touch shadow-md">
              <RefreshCw className="h-4 w-4 mr-2" /> Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value, className }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
