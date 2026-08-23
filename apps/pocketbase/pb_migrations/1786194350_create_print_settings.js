/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('print_settings');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'print_settings',
        // Admin-only writes. Reads are open to admin + waiter + kds so the
        // waiter/KDS UI can fetch the settings to gate printing client-side.
        // The updateRule / createRule / deleteRule are admin-only, which is
        // the security boundary — staff can read the toggles but cannot
        // change them.
        listRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"',
        viewRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"',
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          // Enable/disable KOT printing restaurant-wide. Default true.
          // When false, no waiter/KDS role may print or auto-print,
          // regardless of per-waiter settings.
          { name: 'restaurantWidePrintEnabled', type: 'bool' },
          // Auto-print every new KOT on creation (initial order + each
          // additional child ticket). Default false. Respects the
          // restaurant-wide toggle and per-waiter settings.
          { name: 'autoPrintKOT', type: 'bool' },
          // Per-waiter print enable/disable. Stored as a JSON map of
          // waiter user id -> { enabled: boolean }. A waiter may print
          // only if both the restaurant-wide toggle AND their own entry
          // allow it. Missing entry = allowed (per-waiter can only
          // restrict, never expand).
          { name: 'perWaiterPrintSettings', type: 'json', maxSize: 200000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }

    // Seed a single default settings record if none exists.
    try {
      const existing = app.findRecordsByFilter(
        'print_settings',
        '1=1',
        '',
        1,
      );
      if (!existing || existing.length === 0) {
        const rec = new Record(collection);
        rec.set('restaurantWidePrintEnabled', true);
        rec.set('autoPrintKOT', false);
        rec.set('perWaiterPrintSettings', {});
        app.save(rec);
      }
    } catch (e) {
      $app.logger().error('print_settings seed failed', 'err', String(e));
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('print_settings');
      app.delete(collection);
    } catch (e) {
      if (e.message.includes('no rows in result set')) {
        return;
      }
      throw e;
    }
  },
);
