/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // --- staff_messages: add senderId + recipientId for user-specific routing ---
    // These are optional text fields. When set, a message is routed to a
    // specific user (e.g. admin -> a single waiter). When empty, the message
    // falls back to the legacy role-based routing (kds quick broadcast,
    // waiter alert to admin/kds role). Existing rows keep empty values.
    const msgs = app.findCollectionByNameOrId("staff_messages");
    if (!msgs.fields.getByName("senderId")) {
      msgs.fields.add(new TextField({ name: "senderId", max: 100 }));
    }
    if (!msgs.fields.getByName("recipientId")) {
      msgs.fields.add(new TextField({ name: "recipientId", max: 100 }));
    }
    app.save(msgs);

    // --- staff_calls: add callerId + calleeId for user-specific call signaling ---
    // Lets Admin/KDS ring a single waiter instead of every waiter at once.
    const calls = app.findCollectionByNameOrId("staff_calls");
    if (!calls.fields.getByName("callerId")) {
      calls.fields.add(new TextField({ name: "callerId", max: 100 }));
    }
    if (!calls.fields.getByName("calleeId")) {
      calls.fields.add(new TextField({ name: "calleeId", max: 100 }));
    }
    app.save(calls);

    // --- waiter_users: allow KDS to list/view waiters ---
    // Required so the KDS Staff Chat can populate the "Waiters" dropdown and
    // open a private conversation with each individual waiter. Admins already
    // had access; waiters still only see their own record.
    const waiters = app.findCollectionByNameOrId("waiter_users");
    const waiterReadRule =
      'id = @request.auth.id || @request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users"';
    waiters.listRule = waiterReadRule;
    waiters.viewRule = waiterReadRule;
    app.save(waiters);
  },
  (app) => {
    try {
      const msgs = app.findCollectionByNameOrId("staff_messages");
      if (msgs.fields.getByName("senderId")) msgs.fields.removeByName("senderId");
      if (msgs.fields.getByName("recipientId")) msgs.fields.removeByName("recipientId");
      app.save(msgs);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
    try {
      const calls = app.findCollectionByNameOrId("staff_calls");
      if (calls.fields.getByName("callerId")) calls.fields.removeByName("callerId");
      if (calls.fields.getByName("calleeId")) calls.fields.removeByName("calleeId");
      app.save(calls);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
    try {
      const waiters = app.findCollectionByNameOrId("waiter_users");
      const oldRule =
        'id = @request.auth.id || @request.auth.collectionName = "admin_users"';
      waiters.listRule = oldRule;
      waiters.viewRule = oldRule;
      app.save(waiters);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
