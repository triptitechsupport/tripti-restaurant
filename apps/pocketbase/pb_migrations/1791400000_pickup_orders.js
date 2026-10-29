/// <reference path="../pb_data/types.d.ts" />

// Online pre-orders for pickup at the restaurant.
// - menu_items: preparation time, advance notice and a "not for pickup" switch
// - orders: pickup date/time, workflow status, kitchen links and a private
//   token so the guest can open their own order without an account
// - waiter_orders: marks orders that came from the website
// - pickup_settings: the rules the admin can change (slots, lead time, ...)
// - order_counters: a "pickup" counter for order numbers AB-0001, AB-0002 ...
const STAFF = '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"';
const ADMIN = '@request.auth.collectionName = "admin_users"';

migrate(
  (app) => {
    const addField = (collection, field) => {
      if (!collection.fields.getByName(field.name)) collection.fields.add(field);
    };

    // ---- menu_items ----
    const menu = app.findCollectionByNameOrId('menu_items');
    addField(menu, new NumberField({ name: 'prepMinutes', min: 0, max: 600, onlyInt: true }));
    addField(menu, new NumberField({ name: 'noticeHours', min: 0, max: 720, onlyInt: true }));
    addField(menu, new BoolField({ name: 'pickupBlocked' }));
    app.save(menu);

    // ---- orders ----
    const orders = app.findCollectionByNameOrId('orders');
    const addr = orders.fields.getByName('deliveryAddress');
    if (addr) addr.required = false;
    addField(orders, new SelectField({ name: 'orderType', maxSelect: 1, values: ['delivery', 'pickup'] }));
    addField(orders, new SelectField({
      name: 'status',
      maxSelect: 1,
      values: ['received', 'confirmed', 'in_kitchen', 'ready', 'picked_up', 'cancelled', 'no_show'],
    }));
    addField(orders, new TextField({ name: 'pickupDate', max: 10 }));
    addField(orders, new TextField({ name: 'pickupTime', max: 5 }));
    addField(orders, new DateField({ name: 'pickupAt' }));
    addField(orders, new DateField({ name: 'releaseAt' }));
    addField(orders, new DateField({ name: 'releasedAt' }));
    addField(orders, new NumberField({ name: 'prepMinutes', min: 0, onlyInt: true }));
    addField(orders, new TextField({ name: 'notes', max: 500 }));
    addField(orders, new TextField({ name: 'staffNote', max: 500 }));
    addField(orders, new TextField({ name: 'cancelReason', max: 300 }));
    addField(orders, new TextField({ name: 'paymentMethod', max: 40 }));
    addField(orders, new TextField({ name: 'lang', max: 5 }));
    addField(orders, new TextField({ name: 'publicToken', max: 64, hidden: true }));
    addField(orders, new TextField({ name: 'kitchenOrder', max: 40 }));
    addField(orders, new TextField({ name: 'waiterOrder', max: 40 }));
    addField(orders, new DateField({ name: 'kitchenSeenAt' }));
    addField(orders, new TextField({ name: 'kitchenSeenBy', max: 100 }));
    addField(orders, new JSONField({ name: 'statusLog', maxSize: 20000 }));
    // Orders now come only through the API (prices are taken from the menu,
    // the pickup slot is checked).
    // Staff read them; every change goes through the API (which checks the
    // allowed status steps), so only admins may edit records directly.
    // customerId must be set for the "own order" rule: a guest order has none,
    // and an empty value would otherwise match a signed-out visitor.
    orders.listRule = STAFF;
    orders.viewRule = `(customerId != "" && customerId = @request.auth.id) || ${STAFF}`;
    orders.createRule = null;
    orders.updateRule = ADMIN;
    orders.deleteRule = ADMIN;
    app.save(orders);

    // ---- waiter_orders ----
    const wo = app.findCollectionByNameOrId('waiter_orders');
    addField(wo, new TextField({ name: 'channel', max: 20 }));
    addField(wo, new TextField({ name: 'pickupOrder', max: 40 }));
    app.save(wo);

    // ---- order number counter ----
    const counters = app.findCollectionByNameOrId('order_counters');
    const type = counters.fields.getByName('counterType');
    if (type && !type.values.includes('pickup')) {
      type.values = [...type.values, 'pickup'];
      app.save(counters);
    }
    const existingCounter = app.findRecordsByFilter('order_counters', 'counterType = "pickup"', '', 1, 0);
    if (!existingCounter.length) {
      const c = new Record(counters);
      c.set('counterType', 'pickup');
      c.set('nextSeq', 0);
      app.save(c);
    }

    // ---- pickup_settings ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId('pickup_settings');
    } catch (_) {
      settings = new Collection({
        type: 'base',
        name: 'pickup_settings',
        listRule: '',
        viewRule: '',
        createRule: ADMIN,
        updateRule: ADMIN,
        deleteRule: ADMIN,
        fields: [
          { name: 'enabled', type: 'bool' },
          { name: 'autoConfirm', type: 'bool' },
          { name: 'slotMinutes', type: 'number', min: 5, max: 120, onlyInt: true },
          { name: 'minLeadMinutes', type: 'number', min: 0, max: 1440, onlyInt: true },
          { name: 'defaultPrepMinutes', type: 'number', min: 0, max: 600, onlyInt: true },
          { name: 'releaseBufferMinutes', type: 'number', min: 0, max: 240, onlyInt: true },
          { name: 'maxDaysAhead', type: 'number', min: 0, max: 60, onlyInt: true },
          { name: 'maxOrdersPerSlot', type: 'number', min: 0, max: 100, onlyInt: true },
          { name: 'maxDishesPerSlot', type: 'number', min: 0, max: 500, onlyInt: true },
          { name: 'previewDays', type: 'number', min: 0, max: 14, onlyInt: true },
          { name: 'lunchStart', type: 'text', max: 5 },
          { name: 'lunchEnd', type: 'text', max: 5 },
          { name: 'dinnerStart', type: 'text', max: 5 },
          { name: 'dinnerEnd', type: 'text', max: 5 },
          { name: 'noteDE', type: 'text', max: 500 },
          { name: 'noteEN', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(settings);
    }
    const rows = app.findRecordsByFilter('pickup_settings', 'id != ""', '', 1, 0);
    if (!rows.length) {
      const r = new Record(settings);
      r.load({
        enabled: true,
        autoConfirm: true,
        slotMinutes: 15,
        minLeadMinutes: 45,
        defaultPrepMinutes: 20,
        releaseBufferMinutes: 10,
        maxDaysAhead: 14,
        maxOrdersPerSlot: 4,
        maxDishesPerSlot: 0,
        previewDays: 2,
        lunchStart: '11:30',
        lunchEnd: '13:00',
        dinnerStart: '17:30',
        dinnerEnd: '21:00',
        noteDE: 'Bezahlung bei Abholung, bar oder mit Karte.',
        noteEN: 'Pay when you pick up, cash or card.',
      });
      app.save(r);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId('pickup_settings')); } catch (_) { /* gone */ }
    const drop = (name, fields) => {
      const c = app.findCollectionByNameOrId(name);
      fields.forEach((f) => c.fields.removeByName(f));
      app.save(c);
    };
    drop('menu_items', ['prepMinutes', 'noticeHours', 'pickupBlocked']);
    drop('waiter_orders', ['channel', 'pickupOrder']);
    drop('orders', ['orderType', 'status', 'pickupDate', 'pickupTime', 'pickupAt', 'releaseAt', 'releasedAt',
      'prepMinutes', 'notes', 'staffNote', 'cancelReason', 'paymentMethod', 'lang', 'publicToken',
      'kitchenOrder', 'waiterOrder', 'kitchenSeenAt', 'kitchenSeenBy', 'statusLog']);
    const orders = app.findCollectionByNameOrId('orders');
    const addr = orders.fields.getByName('deliveryAddress');
    if (addr) addr.required = true;
    orders.listRule = ADMIN;
    orders.viewRule = `customerId = @request.auth.id || ${ADMIN}`;
    orders.createRule = '';
    orders.updateRule = ADMIN;
    app.save(orders);
  },
);
