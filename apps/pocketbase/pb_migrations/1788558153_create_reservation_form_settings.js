/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('reservation_form_settings');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'reservation_form_settings',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          {
            name: 'specialRequestsPlaceholderDE',
            type: 'text',
            required: false,
            max: 250,
          },
          {
            name: 'specialRequestsPlaceholderEN',
            type: 'text',
            required: false,
            max: 250,
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
      });
      app.save(collection);
    }

    const existing = app.findRecordsByFilter(
      'reservation_form_settings',
      'id != ""',
      '-created',
      1,
      0,
    );
    if (!existing || existing.length === 0) {
      const record = new Record(collection);
      record.set(
        'specialRequestsPlaceholderDE',
        'Falls Sie weitere besondere Wünsche für das Restaurant haben',
      );
      record.set(
        'specialRequestsPlaceholderEN',
        'If any other special requests for restaurant',
      );
      app.save(record);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('reservation_form_settings');
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) {
        return;
      }
      throw e;
    }
  },
);
