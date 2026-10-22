/// <reference path="../pb_data/types.d.ts" />

// Weekly stock requests from the kitchen manager to the stock manager.
// - Kitchen manager: writes the request (draft), sends it (submitted) and may
//   change or cancel it until the stock manager starts working on it.
// - Stock manager: starts it, fills in what was given (fulfilledQty per line)
//   and finishes it (fulfilled or partial). The requested lines stay as sent,
//   except that a line not yet in the stock list may be linked to a stock item.
// - Kitchen manager again: confirms the goods arrived (receivedAt), with a note.
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
  ['startedAt', 'fulfilledAt', 'fulfilledBy', 'fulfilledByName', 'stockNote', 'receivedAt', 'receivedByName', 'receivedNote'].forEach((f) => e.record.set(f, ''));
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
    // Confirming receipt of a request the stock manager finished.
    if ((before === 'fulfilled' || before === 'partial') && after === before) {
      ['weekStart', 'neededBy', 'notes', 'items', 'startedAt', 'fulfilledAt', 'fulfilledBy', 'fulfilledByName', 'stockNote', 'requestedBy', 'requestedByName', 'submittedAt'].forEach((f) => {
        if (old.getString(f) !== e.record.getString(f)) throw new ForbiddenError('Only the receipt can be confirmed now.');
      });
      if (old.getString('receivedAt')) throw new BadRequestError('This request was already confirmed.');
      e.record.set('receivedAt', now);
      e.record.set('receivedByName', auth.getString('displayName') || auth.getString('username'));
      e.next();
      return;
    }
    if (before !== 'draft' && before !== 'submitted')
      throw new BadRequestError('The stock manager is already working on this request. Ask them for changes.');
    if (['draft', 'submitted', 'cancelled'].indexOf(after) < 0)
      throw new ForbiddenError('Only the stock manager can fulfil a request.');
    ['startedAt', 'fulfilledAt', 'fulfilledBy', 'fulfilledByName', 'stockNote', 'requestedBy', 'receivedAt', 'receivedByName', 'receivedNote'].forEach((f) => {
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
    ['weekStart', 'neededBy', 'notes', 'requestedBy', 'requestedByName', 'submittedAt', 'receivedAt', 'receivedByName', 'receivedNote'].forEach((f) => {
      if (!same(f)) throw new ForbiddenError('Only the kitchen manager can change the request.');
    });
    const a = parse(old); const b = parse(e.record);
    // A line without a stock item may be linked to one; nothing else changes.
    const key = (it, link) => JSON.stringify([link || '', (it && it.name) || '', (it && it.unit) || '', Number(it && it.qty) || 0]);
    if (a.length !== b.length || a.some((it, i) => {
      const was = (it && it.stockItem) || '';
      const now2 = (b[i] && b[i].stockItem) || '';
      if (was && was !== now2) return true;
      return key(it, '') !== key(b[i], '');
    })) throw new ForbiddenError('The requested items cannot be changed by the stock manager.');
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
