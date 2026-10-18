/// <reference path="../pb_data/types.d.ts" />

// Ensures the Waiter and KDS auth collections can authenticate with a
// password using EITHER their email or their username.
//
// Why this exists: the recent Admin auth repair (1791113000) only touched
// admin_users. On some environments the waiter_users / kds_users collections
// were created by an older migration/snapshot that did not register
// `username` as a password-auth identity field, so logging in with the
// staff username (the field the Waiter/KDS login form submits) fails with
// "Failed to authenticate" even though the account and password are
// correct. Admin login (email-based) keeps working throughout.
//
// This migration is a safe, idempotent normalization: it enables password
// auth and guarantees both `email` and `username` are registered as
// identity fields on waiter_users and kds_users. It does NOT change any
// account, password, or access rule. If the config is already correct this
// is a no-op.
migrate(
  (app) => {
    const names = ["waiter_users", "kds_users"];
    for (const name of names) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (_) {
        // Collection not provisioned yet — nothing to normalize.
        continue;
      }

      // Enable password authentication.
      collection.passwordAuth.enabled = true;

      // Guarantee both email and username are registered as identity
      // fields (username first so the staff login form's username works).
      const fields = collection.passwordAuth.identityFields || [];
      const merged = [];
      for (const f of ["username", "email"]) {
        if (fields.indexOf(f) === -1) merged.push(f);
      }
      collection.passwordAuth.identityFields = merged.length
        ? Array.from(new Set([...merged, ...fields]))
        : fields.length
          ? fields
          : ["username", "email"];

      app.save(collection);
    }
  },
  (app) => {
    // Leave auth enabled. Rolling back must not lock staff out.
  },
);
