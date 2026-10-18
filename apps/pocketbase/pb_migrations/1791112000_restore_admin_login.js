/// <reference path="../pb_data/types.d.ts" />

// Restores the admin identity used by the dashboard login.
// A previous password update was rejected (password confirmation did not
// match), so the published site never received a working verifier for this
// email. This sets a fresh password without copying any password from the
// login screen. The plaintext is revealed only in the chat confirmation.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("admin_users");
    let record;
    try {
      record = app.findFirstRecordByData("admin_users", "email", "check@gmail.com");
    } catch (_) {
      record = new Record(collection);
      record.set("email", "check@gmail.com");
    }
    record.setVerified(true);
    record.setPassword($os.getenv("ADMIN_BOOTSTRAP_PASSWORD") || $security.randomString(32));
    app.save(record);
  },
  (app) => {
    // Keep the account. Rolling back must not lock the dashboard out.
  },
);
