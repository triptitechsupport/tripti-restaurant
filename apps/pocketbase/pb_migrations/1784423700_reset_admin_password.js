/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const record = app.findFirstRecordByData("admin_users", "email", "admin@restaurant.com");
  record.setPassword("SecureAdmin2026!Pwd");
  record.set("verified", true);
  app.save(record);
}, (app) => {
  // no-op rollback
})
