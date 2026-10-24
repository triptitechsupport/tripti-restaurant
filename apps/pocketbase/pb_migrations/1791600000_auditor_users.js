/// <reference path="../pb_data/types.d.ts" />

// Auditor logins, created by the admin. An auditor can only look: receipts,
// payments and the DEP7 export (through the billing API). No collection rule
// gives auditor_users write access to anything.
const ADMIN = '@request.auth.collectionName = "admin_users"';

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('auditor_users');
      return;
    } catch (_) { /* create below */ }
    const auditors = new Collection({
      type: 'auth',
      name: 'auditor_users',
      listRule: `id = @request.auth.id || ${ADMIN}`,
      viewRule: `id = @request.auth.id || ${ADMIN}`,
      createRule: ADMIN,
      updateRule: `(id = @request.auth.id && @request.body.role:isset = false) || ${ADMIN}`,
      deleteRule: ADMIN,
      passwordAuth: { enabled: true, identityFields: ['username', 'email'] },
      authAlert: { enabled: false },
      fields: [
        { name: 'username', type: 'text', required: true, max: 100 },
        { name: 'displayName', type: 'text', required: false, max: 100 },
        { name: 'role', type: 'select', maxSelect: 1, values: ['auditor'] },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_auditor_username` ON `auditor_users` (`username`)'],
    });
    app.save(auditors);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('auditor_users'));
    } catch (_) { /* already gone */ }
  },
);
