/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---- Fix KDS demo account ----
    const kds = app.findCollectionByNameOrId("kds_users");
    let kdsRec;
    try {
      kdsRec = app.findFirstRecordByFilter("kds_users", "username = 'kds001'");
    } catch (_) {
      try {
        // Reuse the previously seeded "kitchen" account if present
        kdsRec = app.findFirstRecordByFilter("kds_users", "username = 'kitchen'");
      } catch (_) {
        kdsRec = new Record(kds);
      }
    }
    kdsRec.set("username", "kds001");
    kdsRec.set("displayName", "Kitchen Display");
    kdsRec.setEmail("kds001@kds.local");
    kdsRec.setPassword("KdsPass123!");
    kdsRec.setVerified(true);
    app.save(kdsRec);

    // ---- Fix Waiter demo account ----
    const waiter = app.findCollectionByNameOrId("waiter_users");
    let waiterRec;
    try {
      waiterRec = app.findFirstRecordByFilter("waiter_users", "username = 'waiter001'");
    } catch (_) {
      try {
        waiterRec = app.findFirstRecordByFilter("waiter_users", "username = 'waiter'");
      } catch (_) {
        waiterRec = new Record(waiter);
      }
    }
    waiterRec.set("username", "waiter001");
    waiterRec.set("displayName", "Waiter");
    waiterRec.setEmail("waiter001@waiter.local");
    waiterRec.setPassword("WaiterPass123!");
    waiterRec.setVerified(true);
    app.save(waiterRec);
  },
  (app) => {
    // no-op rollback: leave accounts as-is
  },
);
