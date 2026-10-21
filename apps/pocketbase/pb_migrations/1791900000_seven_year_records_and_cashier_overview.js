/// <reference path="../pb_data/types.d.ts" />
// 1. Keep order records for at least 8 years (Austrian 7-year retention from
//    the end of the calendar year). The old default deleted them after 40 days.
// 2. The cashier's live overview may read the waiter list and who is on shift.
const CASHIER = '(@request.auth.collectionName = "waiter_users" && @request.auth.role = "cashier")';
migrate((app) => {
  try {
    const settings = app.findFirstRecordByFilter('retention_settings', "id != ''");
    if (settings && settings.getInt('retentionDays') < 2922) {
      settings.set('retentionDays', 2922);
      app.save(settings);
    }
  } catch (_) { /* no settings row yet: the hook uses 8 years */ }
  for (const name of ['waiter_users', 'waiter_timesheets']) {
    const col = app.findCollectionByNameOrId(name);
    for (const rule of ['listRule', 'viewRule']) {
      const current = col[rule];
      if (current == null || current.includes(CASHIER)) continue;
      col[rule] = current ? `(${current}) || ${CASHIER}` : CASHIER;
    }
    app.save(col);
  }
}, (app) => {
  for (const name of ['waiter_users', 'waiter_timesheets']) {
    const col = app.findCollectionByNameOrId(name);
    for (const rule of ['listRule', 'viewRule']) {
      const current = col[rule];
      if (current && current.includes(CASHIER)) col[rule] = current.replace(` || ${CASHIER}`, '').replace(/^\((.*)\)$/, '$1');
    }
    app.save(col);
  }
});
