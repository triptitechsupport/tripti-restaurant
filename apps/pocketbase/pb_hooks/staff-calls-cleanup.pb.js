/// <reference path="../pb_data/types.d.ts" />
// Staff calls: when a new call starts, end calls nobody answered and delete
// calls older than two days (members and signals go with them).
onRecordAfterCreateSuccess((e) => {
  try {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    for (const r of $app.findRecordsByFilter('call_rooms', 'created < {:old}', '', 200, 0, { old })) {
      $app.delete(r);
    }
    const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ');
    for (const r of $app.findRecordsByFilter('call_rooms', 'status = "ringing" && created < {:stale}', '', 200, 0, { stale })) {
      r.set('status', 'ended');
      $app.save(r);
    }
  } catch (err) {
    console.log('staff calls cleanup: ' + err);
  }
  e.next();
}, 'call_rooms');
