import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, Loader2, RotateCcw, CheckCircle2, AlertTriangle, BookOpen, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { downloadCsv } from '@/lib/csvUtils.js';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import { menuItemsExportColumns, menuItemsImportConfig, categoriesExportColumns, categoriesImportConfig } from '@/lib/csvConfigs.js';
import {
  ROLE_TABLES, collectBackup, backupToCsv, parseBackupCsv, restoreBackup, countBackup, recipesToCsv, parseRecipesCsv,
} from '@/lib/kitchenBackup.js';

// Backup and restore of kitchen / stock data as CSV.
// - Every visit (and every 10 minutes) this device keeps a backup copy.
// - When the server database was started fresh (Render test site: every
//   deploy, restart or sleep), the copy on this device is restored
//   automatically, unless a newer backup was already restored.
// role: 'kitchen_manager' | 'stock' | 'admin'

const T = {
  en: {
    title: 'Backup & restore', sub: 'Save all data as a CSV file and load it back. This device also keeps an automatic backup.',
    auto: 'Automatic backup on this device', last: (t) => `Last saved ${t}`, never: 'Not saved yet', now: 'Back up now', saved: 'Backup saved on this device',
    download: 'Download backup (CSV)', restoreFile: 'Restore from a backup file', choose: 'Choose CSV file',
    merge: 'Add and update (keep everything else)', mirror: 'Replace (also remove dishes and items not in the file)',
    restore: 'Restore now', restoring: 'Restoring…', done: 'Restore finished', inFile: 'In the file',
    created: 'new', updated: 'updated', deleted: 'removed', failed: 'failed', kept: 'kept',
    autoRestored: (t) => `The server had started empty. Your data was restored from this device's backup (${t}).`,
    recipes: 'Recipes as CSV', recipesSub: 'One row per dish. Ingredients like "Basmati rice 600 g; Chicken 800 g".',
    exportRecipes: 'Export recipes', importRecipes: 'Import recipes', recipesDone: (n) => `${n} recipes saved`,
    menu: 'Menu and categories as CSV', menuSub: 'Export, edit in Excel, import again. Dishes are matched by ID or English name.',
    serverNote: 'After every deploy the server also loads the backup file kept in the project (deploy/seed). Send Claude your newest backup file to update it.',
    tables: { categories: 'Categories', menu_items: 'Dishes', recipes: 'Recipes', stock_requests: 'Stock requests', stock_items: 'Stock items', stock_lots: 'Stock lots', stock_locations: 'Locations' },
    notBackup: 'This is not a backup file.', confirmMirror: 'Replace the data with the file? Dishes and items that are not in the file will be removed.',
  },
  de: {
    title: 'Sicherung & Wiederherstellung', sub: 'Alle Daten als CSV-Datei sichern und wieder laden. Dieses Gerät sichert zusätzlich automatisch.',
    auto: 'Automatische Sicherung auf diesem Gerät', last: (t) => `Zuletzt gesichert ${t}`, never: 'Noch nicht gesichert', now: 'Jetzt sichern', saved: 'Sicherung auf diesem Gerät gespeichert',
    download: 'Sicherung herunterladen (CSV)', restoreFile: 'Aus Sicherungsdatei wiederherstellen', choose: 'CSV-Datei wählen',
    merge: 'Hinzufügen und aktualisieren (Rest bleibt)', mirror: 'Ersetzen (Gerichte und Artikel, die nicht in der Datei sind, werden entfernt)',
    restore: 'Jetzt wiederherstellen', restoring: 'Wird wiederhergestellt…', done: 'Wiederherstellung fertig', inFile: 'In der Datei',
    created: 'neu', updated: 'aktualisiert', deleted: 'entfernt', failed: 'fehlgeschlagen', kept: 'behalten',
    autoRestored: (t) => `Der Server war leer gestartet. Die Daten wurden aus der Sicherung dieses Geräts wiederhergestellt (${t}).`,
    recipes: 'Rezepte als CSV', recipesSub: 'Eine Zeile pro Gericht. Zutaten z. B. "Basmatireis 600 g; Hähnchen 800 g".',
    exportRecipes: 'Rezepte exportieren', importRecipes: 'Rezepte importieren', recipesDone: (n) => `${n} Rezepte gespeichert`,
    menu: 'Speisekarte und Kategorien als CSV', menuSub: 'Exportieren, in Excel bearbeiten, wieder importieren. Zuordnung über ID oder englischen Namen.',
    serverNote: 'Nach jedem Deploy lädt der Server außerdem die im Projekt hinterlegte Sicherungsdatei (deploy/seed). Die neueste Sicherung an Claude schicken, um sie zu aktualisieren.',
    tables: { categories: 'Kategorien', menu_items: 'Gerichte', recipes: 'Rezepte', stock_requests: 'Lageranforderungen', stock_items: 'Lagerartikel', stock_lots: 'Chargen', stock_locations: 'Lagerorte' },
    notBackup: 'Das ist keine Sicherungsdatei.', confirmMirror: 'Daten durch die Datei ersetzen? Gerichte und Artikel, die nicht in der Datei sind, werden entfernt.',
  },
};

const storeKey = (role) => `tripti_backup_${role}`;
const readStored = (role) => { try { return JSON.parse(localStorage.getItem(storeKey(role)) || 'null'); } catch (_) { return null; } };
const writeStored = (role, value) => { try { localStorage.setItem(storeKey(role), JSON.stringify(value)); return true; } catch (_) { return false; } };
const infoField = (role) => (role === 'stock' ? 'stockBackupAt' : 'kitchenBackupAt');
const today = () => new Date().toISOString().slice(0, 10);

async function instanceInfo(client) {
  try { return (await client.collection('instance_info').getList(1, 1, { $autoCancel: false, requestKey: null })).items[0] || null; }
  catch (_) { return null; }
}

// Take a backup of this role's tables and keep it on the device.
export async function saveDeviceBackup(client, role) {
  const info = await instanceInfo(client);
  const tables = ROLE_TABLES[role];
  const data = await collectBackup(client, tables);
  if (!Object.values(data).some((v) => v && v.length)) return null;
  const savedAt = new Date().toISOString();
  const csv = backupToCsv(data, { role, savedAt });
  const prev = readStored(role);
  const value = { savedAt, instance: info?.id || '', csv, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ? v.length : 0])) };
  // Keep the copy from the previous database too, in case this one is wrong.
  if (prev && prev.instance && prev.instance !== value.instance) value.previous = { savedAt: prev.savedAt, instance: prev.instance, csv: prev.csv };
  else if (prev?.previous) value.previous = prev.previous;
  writeStored(role, value);
  return value;
}

// Automatic: restore after a fresh database, then keep backing up.
export function useAutoBackup(client, role, enabled = true) {
  const { language } = useLanguage();
  const tx = T[language === 'de' ? 'de' : 'en'];
  const [state, setState] = useState(() => readStored(role));
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (!enabled || !client || busy.current) return;
    busy.current = true;
    try {
      const info = await instanceInfo(client);
      const stored = readStored(role);
      const field = infoField(role);
      const restoredAt = Math.max(Date.parse(info?.[field] || '') || 0, Date.parse(info?.seedBackupAt || '') || 0);
      if (info && stored?.csv && stored.instance && stored.instance !== info.id && Date.parse(stored.savedAt) > restoredAt) {
        const parsed = parseBackupCsv(stored.csv);
        await restoreBackup(client, parsed, { tables: ROLE_TABLES[role], mode: 'mirror' });
        const patch = { [field]: stored.savedAt };
        if (role === 'admin') { patch.kitchenBackupAt = stored.savedAt; patch.stockBackupAt = stored.savedAt; }
        await client.collection('instance_info').update(info.id, patch, { $autoCancel: false }).catch(() => {});
        toast.success(tx.autoRestored(new Date(stored.savedAt).toLocaleString()), { duration: 10000 });
      }
      const saved = await saveDeviceBackup(client, role);
      if (saved) setState(saved);
      // This device was already working on this database: its data is the
      // newest, so older copies on other devices must not be restored over it.
      if (saved && info && stored?.instance === info.id) {
        const patch = { [field]: saved.savedAt };
        if (role === 'admin') { patch.kitchenBackupAt = saved.savedAt; patch.stockBackupAt = saved.savedAt; }
        await client.collection('instance_info').update(info.id, patch, { $autoCancel: false, requestKey: null }).catch(() => {});
      }
    } catch (err) {
      console.error('[Backup] automatic backup failed', err);
    } finally {
      busy.current = false;
    }
  }, [client, role, enabled, tx]);

  useEffect(() => {
    if (!enabled) return undefined;
    const first = setTimeout(run, 4000);
    const timer = setInterval(run, 10 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [run, enabled]);

  return { state, setState, run };
}

export default function DataBackup({ client, role = 'kitchen_manager', auto }) {
  const { language } = useLanguage();
  const de = language === 'de';
  const tx = T[de ? 'de' : 'en'];
  const tables = ROLE_TABLES[role];
  const kitchen = role !== 'stock';
  const [busy, setBusy] = useState('');
  const [file, setFile] = useState(null); // { name, parsed }
  const [mode, setMode] = useState('merge');
  const [result, setResult] = useState(null);
  const [recipeResult, setRecipeResult] = useState(null);
  const fileRef = useRef(null);
  const recipeRef = useRef(null);
  const last = auto?.state;

  const backupNow = async () => {
    setBusy('now');
    try { const v = await saveDeviceBackup(client, role); if (v) { auto?.setState?.(v); toast.success(tx.saved); } }
    catch (err) { toast.error(err?.message || 'Backup failed'); } finally { setBusy(''); }
  };

  const download = async () => {
    setBusy('download');
    try {
      const data = await collectBackup(client, tables);
      downloadCsv(`tripti-${role === 'stock' ? 'stock' : 'kitchen'}-backup-${today()}.csv`, backupToCsv(data, { role }));
    } catch (err) { toast.error(err?.message || 'Export failed'); } finally { setBusy(''); }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setResult(null);
    try { setFile({ name: f.name, parsed: parseBackupCsv(await f.text()) }); }
    catch (err) { setFile(null); toast.error(err?.message || tx.notBackup); }
  };

  const restore = async () => {
    if (!file) return;
    if (mode === 'mirror' && !window.confirm(tx.confirmMirror)) return;
    setBusy('restore');
    try {
      const summary = await restoreBackup(client, file.parsed, { tables, mode });
      setResult(summary);
      toast.success(tx.done);
      const v = await saveDeviceBackup(client, role);
      if (v) auto?.setState?.(v);
    } catch (err) { toast.error(err?.message || 'Restore failed'); } finally { setBusy(''); }
  };

  const exportRecipes = async () => {
    setBusy('rexp');
    try {
      const opts = { $autoCancel: false, requestKey: null };
      const [recipes, menu] = await Promise.all([client.collection('recipes').getFullList(opts), client.collection('menu_items').getFullList(opts)]);
      downloadCsv(`tripti-recipes-${today()}.csv`, recipesToCsv(recipes, Object.fromEntries(menu.map((m) => [m.id, m]))));
    } catch (err) { toast.error(err?.message || 'Export failed'); } finally { setBusy(''); }
  };

  const importRecipes = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy('rimp');
    setRecipeResult(null);
    try {
      const opts = { $autoCancel: false, requestKey: null };
      const [recipes, menu, stock] = await Promise.all([
        client.collection('recipes').getFullList(opts),
        client.collection('menu_items').getFullList(opts),
        client.collection('stock_items').getFullList(opts).catch(() => []),
      ]);
      const { rows, errors } = parseRecipesCsv(await f.text(), menu, stock);
      const byDish = Object.fromEntries(recipes.map((r) => [r.menuItem, r]));
      let saved = 0;
      for (const r of rows) {
        try {
          if (byDish[r.menuItem]) await client.collection('recipes').update(byDish[r.menuItem].id, r.data, opts);
          else await client.collection('recipes').create(r.data, opts);
          saved += 1;
        } catch (err) { errors.push(`${r.dishName}: ${err?.message || err}`); }
      }
      setRecipeResult({ saved, errors });
      toast.success(tx.recipesDone(saved));
    } catch (err) { toast.error(err?.message || 'Import failed'); } finally { setBusy(''); }
  };

  const btn = 'h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60';
  const spin = (k, Icon) => (busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);
  const lastText = last?.savedAt ? tx.last(new Date(last.savedAt).toLocaleString(de ? 'de-AT' : 'en-GB')) : tx.never;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-serif font-bold text-primary flex items-center gap-2"><DatabaseBackup className="h-5 w-5" />{tx.title}</h2>
        <p className="text-sm text-muted-foreground">{tx.sub}</p>
      </div>

      <section className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className={`h-5 w-5 ${last?.savedAt ? 'text-green-600' : 'text-muted-foreground'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{tx.auto}</div>
            <div className="text-xs text-muted-foreground">
              {lastText}
              {last?.counts && <> · {Object.entries(last.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${tx.tables[k] || k}`).join(', ')}</>}
            </div>
          </div>
          <button type="button" onClick={backupNow} disabled={!!busy} className={btn}>{spin('now', RotateCcw)}{tx.now}</button>
        </div>
        <button type="button" onClick={download} disabled={!!busy} className={`${btn} w-full sm:w-auto bg-primary text-primary-foreground border-primary`}>{spin('download', Download)}{tx.download}</button>
        <p className="text-xs text-muted-foreground">{tx.serverNote}</p>
      </section>

      <section className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
        <h3 className="font-bold text-primary">{tx.restoreFile}</h3>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className={btn}><Upload className="h-4 w-4" />{tx.choose}</button>
        {file && (
          <div className="space-y-3">
            <p className="text-sm"><b>{file.name}</b>{file.parsed.meta?.savedAt && <> · {new Date(file.parsed.meta.savedAt).toLocaleString(de ? 'de-AT' : 'en-GB')}</>}</p>
            <p className="text-xs text-muted-foreground">{tx.inFile}: {Object.entries(countBackup(file.parsed)).map(([k, n]) => `${n} ${tx.tables[k] || k}`).join(', ')}</p>
            <div className="space-y-1.5 text-sm">
              {['merge', 'mirror'].map((m) => (
                <label key={m} className="flex items-start gap-2"><input type="radio" name="restore-mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1" />{tx[m]}</label>
              ))}
            </div>
            <button type="button" onClick={restore} disabled={!!busy} className={`${btn} bg-primary text-primary-foreground border-primary`}>{spin('restore', Upload)}{busy === 'restore' ? tx.restoring : tx.restore}</button>
          </div>
        )}
        {result && (
          <ul className="text-sm divide-y divide-border rounded-lg border border-border">
            {Object.entries(result).map(([k, s]) => (
              <li key={k} className="px-3 py-2">
                <b>{tx.tables[k] || k}</b>: {s.created} {tx.created}, {s.updated} {tx.updated}{s.deleted ? `, ${s.deleted} ${tx.deleted}` : ''}{s.failed ? <span className="text-destructive">, {s.failed} {tx.failed}</span> : ''}
                {s.errors.length > 0 && <div className="text-xs text-destructive flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{s.errors.join(' · ')}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {kitchen && (
        <section className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
          <h3 className="font-bold text-primary flex items-center gap-2"><BookOpen className="h-4 w-4" />{tx.recipes}</h3>
          <p className="text-xs text-muted-foreground">{tx.recipesSub}</p>
          <input ref={recipeRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importRecipes} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportRecipes} disabled={!!busy} className={btn}>{spin('rexp', Download)}{tx.exportRecipes}</button>
            <button type="button" onClick={() => recipeRef.current?.click()} disabled={!!busy} className={btn}>{spin('rimp', Upload)}{tx.importRecipes}</button>
          </div>
          {recipeResult && (
            <div className="text-sm">
              <p className="font-semibold text-green-700">{tx.recipesDone(recipeResult.saved)}</p>
              {recipeResult.errors.length > 0 && <ul className="mt-1 text-xs text-destructive list-disc pl-5">{recipeResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </section>
      )}

      {kitchen && (
        <section className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
          <h3 className="font-bold text-primary flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" />{tx.menu}</h3>
          <p className="text-xs text-muted-foreground">{tx.menuSub}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold w-24">{tx.tables.menu_items}</span>
            <CsvImportExport client={client} collection="menu_items" entityLabel="menu items" exportFileName={`tripti-menu-${today()}.csv`} exportColumns={menuItemsExportColumns} importConfig={menuItemsImportConfig} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold w-24">{tx.tables.categories}</span>
            <CsvImportExport client={client} collection="categories" entityLabel="categories" exportFileName={`tripti-categories-${today()}.csv`} exportColumns={categoriesExportColumns} importConfig={categoriesImportConfig} />
          </div>
        </section>
      )}
    </div>
  );
}
