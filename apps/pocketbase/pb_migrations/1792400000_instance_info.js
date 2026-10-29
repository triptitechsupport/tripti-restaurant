/// <reference path="../pb_data/types.d.ts" />
// One record per database. Its id changes when the database starts fresh
// (the Render test site loses its data on every deploy), so the staff apps can
// tell that a backup needs restoring. kitchenBackupAt / stockBackupAt hold the
// time of the backup last restored, so an older copy on another device is
// not restored over it.
const STAFF = '@request.auth.collectionName = "admin_users" || (@request.auth.collectionName = "kds_users" && @request.auth.role = "kitchen_manager") || @request.auth.collectionName = "stock_users"';

migrate((app) => {
  let c;
  try { c = app.findCollectionByNameOrId('instance_info'); } catch (_) { c = null; }
  if (!c) {
    c = new Collection({
      type: 'base',
      name: 'instance_info',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: STAFF,
      deleteRule: null,
      fields: [
        { name: 'startedAt', type: 'date' },
        { name: 'kitchenBackupAt', type: 'date' },
        { name: 'stockBackupAt', type: 'date' },
        { name: 'seedBackupAt', type: 'date' },
      ],
    });
    app.save(c);
  }
  const rec = new Record(c);
  rec.set('startedAt', new Date().toISOString());
  app.save(rec);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('instance_info')); } catch (_) { /* gone */ }
});
