/// <reference path="../pb_data/types.d.ts" />

// Retention settings for date-based order/KOT handling.
//
// A single settings record drives the daily retention purge hook:
//   - retentionDays  : how long order/KOT rows are kept (default 40 = 1 month
//                      10 days). Rows older than this are auto-deleted daily.
//   - kotDisplayHours: how long a KOT stays in the active KDS queue before it
//                      leaves the active display (default 5). The record is NOT
//                      deleted — it remains in dated history for export.
//   - lastPurgeAt    : throttle timestamp (text ISO) so the purge runs at most
//                      once per calendar day.
//
// The collection is server-only (all rules null): it is read/written by the
// retention-cleanup hook via $app, never from the REST API.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "retention_settings",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "lastPurgeAt", type: "text", max: 40 },
        { name: "retentionDays", type: "number", min: 1 },
        { name: "kotDisplayHours", type: "number", min: 1 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);

    // Seed the single settings row.
    const r = new Record(collection);
    r.set("lastPurgeAt", "1970-01-01T00:00:00.000Z");
    r.set("retentionDays", 40);
    r.set("kotDisplayHours", 5);
    app.save(r);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("retention_settings");
    app.delete(collection);
  },
);
