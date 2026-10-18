/// <reference path="../pb_data/types.d.ts" />

// The published dashboard still has admin@restaurant.com, but its verifier
// no longer matches the password the owner types. Preview login used a
// different restored account, so the two environments diverged.
// This resets only that original admin identity. Other staff collections
// are left untouched. The plaintext is not logged.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("admin_users");
    collection.authRule = "";
    collection.passwordAuth.enabled = true;
    if (!collection.passwordAuth.identityFields || collection.passwordAuth.identityFields.length === 0) {
      collection.passwordAuth.identityFields = ["email"];
    }
    app.save(collection);

    let record;
    try {
      record = app.findFirstRecordByData("admin_users", "email", "admin@restaurant.com");
    } catch (_) {
      record = new Record(collection);
      record.set("email", "admin@restaurant.com");
    }
    record.setVerified(true);
    record.setPassword("SecureAdmin2026!Pwd");
    app.save(record);
  },
  (app) => {
    // Keep the account. Rolling back must not lock the dashboard out.
  },
);
