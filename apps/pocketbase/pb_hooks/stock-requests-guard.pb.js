/// <reference path="../pb_data/types.d.ts" />

// Weekly stock requests from the kitchen manager to the stock manager.
// - Kitchen manager: writes the request (draft), sends it (submitted) and may
//   change or cancel it until the stock manager starts working on it.
// - Stock manager: starts it, fills in what was given (fulfilledQty per line)
//   and finishes it (fulfilled or partial). The requested lines stay as sent.
// Admins and superusers are not limited.
// (JSVM: every helper lives inside its handler.)

onRecordCreateRequest((e) => {
  const auth = e.auth;
  const col = auth ? auth.collection().name : '';
  if (e.hasSuperuserAuth() || col === 'admin_users') { e.next(); return; }
  const status = e.record.getString('status') || 'draft';
  if (status !== 'draft' && status !== 'submitted') throw new BadRequestError('A new request starts as a draft or is sent straight away.');
  e.record.set('status', status);
  e.record.set('requestedBy', auth.id);
  e.record.set('requestedByName', auth.getString('displayName') || auth.getString('username'));
  if (status === 'submitted') e.record.set('submittedAt', new Date().toISOString());
  ['startedAt', 'fulfilledAt', 'fulfilledBy', 'fulfilledByName', 'stockNote'].forEach((f) => e.record.set(f, ''));
  const items = JSON.parse(e.record.getString('items') || '[]').map((it) => { const c = Object.assign({}, it); delete c.fulfilledQty; return c; });
  e.record.set('items', items);
  e.next();
}, 'stock_requests');

onRecordUpdateRequest((e) => {
  const auth = e.auth;
  const col = auth ? auth.collection().name : '';
  if (e.hasSuperuserAuth() || col === 'admin_users') { e.next(); return; }

  const old = e.record.original();
  const before = old.getString('status');
  const after = e.record.getString('status');
  const parse = (r) => { try { return JSON.parse(r.getString('items') || '[]'); } catch (_) { return []; } };
  const same = (field) => String(old.get(field) || '') === String(e.record.get(field) || '');
  const now = new Date().toISOString();

  if (col === 'kds_users') {
    if (before !== 'draft' && before !== 'submitted')
      throw new BadRequestError('The stock manager is already working on this request. Ask them for changes.');
    if (['draft', 'submitted', 'cancelled'].indexOf(after) < 0)
      throw new ForbiddenError('Only the stock manager can fulfil a request.');
    ['startedAt', 'fulfilledAt', 'fulfilledBy', 'fulfilledByName', 'stockNote', 'requestedBy'].forEach((f) => {
      if (!same(f)) throw new ForbiddenError('These fields are filled in by the stock manager.');
    });
    const items = parse(e.record).map((it) => { const c = Object.assign({}, it); delete c.fulfilledQty; return c; });
    e.record.set('items', items);
    if (after === 'submitted' && before !== 'submitted') e.record.set('submittedAt', now);
    e.next();
    return;
  }

  if (col === 'stock_users') {
    if (['submitted', 'in_progress', 'partial'].indexOf(before) < 0)
      throw new BadRequestError('This request is not open for the stock manager.');
    if (['submitted', 'in_progress', 'partial', 'fulfilled'].indexOf(after) < 0)
      throw new ForbiddenError('The stock manager cannot cancel a request. Ask the kitchen manager.');
    ['weekStart', 'neededBy', 'notes', 'requestedBy', 'requestedByName', 'submittedAt'].forEach((f) => {
      if (!same(f)) throw new ForbiddenError('Only the kitchen manager can change the request.');
    });
    const a = parse(old); const b = parse(e.record);
    const strip = (it) => { const c = Object.assign({}, it || {}); delete c.fulfilledQty; delete c.stockNote; return JSON.stringify([c.stockItem || '', c.name || '', c.unit || '', Number(c.qty) || 0]); };
    if (a.length !== b.length || a.some((it, i) => strip(it) !== strip(b[i])))
      throw new ForbiddenError('The requested items cannot be changed by the stock manager.');
    if (after !== before && after === 'in_progress' && !e.record.getString('startedAt')) e.record.set('startedAt', now);
    if (after === 'fulfilled' || after === 'partial') {
      e.record.set('fulfilledAt', now);
      e.record.set('fulfilledBy', auth.id);
      e.record.set('fulfilledByName', auth.getString('displayName') || auth.getString('username'));
      if (!e.record.getString('startedAt')) e.record.set('startedAt', now);
    }
    e.next();
    return;
  }

  throw new ForbiddenError('Not allowed.');
}, 'stock_requests');
