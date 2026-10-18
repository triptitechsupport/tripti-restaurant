// CSV export/import utilities — RFC 4180 compliant parsing & serialization.
// No external dependencies; pure JS so it runs in the browser.

/**
 * Escape a single field value for CSV output following RFC 4180:
 * wrap in double quotes if it contains a comma, double quote, newline,
 * or carriage return; double any embedded double quotes.
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  let str;
  if (Array.isArray(value)) {
    // Arrays (e.g. allergens) are joined with ';' so they stay in one cell.
    str = value
      .map((v) => (v === null || v === undefined ? '' : String(v)))
      .join(';');
  } else if (typeof value === 'boolean') {
    str = value ? 'true' : 'false';
  } else if (typeof value === 'number') {
    str = Number.isFinite(value) ? String(value) : '';
  } else {
    str = String(value);
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize an array of record objects into a CSV string.
 * @param {Array<Object>} records - rows to export
 * @param {Array<{key:string,label?:string,format?:(v:any,r:Object)=>any}>} columns
 * @returns {string} CSV text with CRLF line endings
 */
export function recordsToCsv(records, columns) {
  const header = columns.map((c) => escapeCsvField(c.label || c.key)).join(',');
  const lines = [header];
  for (const record of records || []) {
    const row = columns
      .map((col) => {
        let val = record[col.key];
        if (typeof col.format === 'function') {
          val = col.format(val, record);
        }
        return escapeCsvField(val);
      })
      .join(',');
    lines.push(row);
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * Handles quoted fields, escaped quotes ("") and embedded newlines.
 * @param {string} text
 * @returns {{headers:string[], rows:Object[]}[] } — single table parse
 */
export function parseCsv(text) {
  // Normalize line endings; the state machine handles \n inside quotes.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // Last field/row if file didn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing empty rows (blank lines)
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ''));

  if (cleaned.length === 0) return { headers: [], rows: [] };

  const headers = cleaned[0].map((h) => h.trim());
  const dataRows = cleaned.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

/**
 * Normalize a CSV header for fuzzy matching: lowercase, trim, collapse
 * spaces, strip common punctuation so "Name (EN)" -> "name en".
 */
export function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .trim()
    .replace(/[_\-./()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a header -> pbField resolver from a field map. The field map keys
 * are normalized aliases; multiple aliases can point to the same pb field.
 * Returns a function (rawHeader) => pbField | undefined.
 */
export function buildFieldResolver(fieldMap) {
  // index by normalized alias
  const index = {};
  Object.entries(fieldMap).forEach(([alias, pbField]) => {
    index[normalizeHeader(alias)] = pbField;
  });
  return (rawHeader) => index[normalizeHeader(rawHeader)];
}

/** Parse a boolean from a CSV cell: true/yes/1/y -> true, else false. */
export function parseBool(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return ['true', 'yes', '1', 'y', 't', 'x'].includes(s);
}

/** Parse a number; returns 0 for empty/invalid. */
export function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Parse a list cell (semicolon or comma-separated) into a trimmed array. */
export function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename, csvText) {
  // Prepend BOM so Excel detects UTF-8 correctly.
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
