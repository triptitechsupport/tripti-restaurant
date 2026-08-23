/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const waiterUsers = app.findCollectionByNameOrId("waiter_users");

    const collection = new Collection({
      type: "base",
      name: "waiter_timesheets",
      // Admin-only reads; waiters can create/update only their own timesheet.
      listRule: "@request.auth.collectionName = 'admin_users'",
      viewRule: "@request.auth.collectionName = 'admin_users'",
      createRule:
        "(@request.auth.collectionName = 'waiter_users' && waiter = @request.auth.id) || @request.auth.collectionName = 'admin_users'",
      updateRule:
        "(@request.auth.collectionName = 'waiter_users' && waiter = @request.auth.id) || @request.auth.collectionName = 'admin_users'",
      deleteRule: "@request.auth.collectionName = 'admin_users'",
      fields: [
        {
          name: "waiter",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: waiterUsers.id,
          cascadeDelete: true,
        },
        { name: "clockIn", type: "date", required: true },
        { name: "clockOut", type: "date" },
        // Shift duration in minutes (calculated on clock-out). Null while shift
        // is in progress.
        { name: "shiftDuration", type: "number", min: 0 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // Enforce one active (unclosed) timesheet per waiter at the DB level.
        "CREATE UNIQUE INDEX idx_waiter_timesheets_active ON waiter_timesheets (waiter) WHERE clockOut IS NULL",
        "CREATE INDEX idx_waiter_timesheets_waiter ON waiter_timesheets (waiter)",
        "CREATE INDEX idx_waiter_timesheets_clockin ON waiter_timesheets (clockIn)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("waiter_timesheets");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("waiter_timesheets not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
