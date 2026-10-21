/// <reference path="../pb_data/types.d.ts" />

// Daily retention purge for restaurant order/KOT data.
//
// Requirements implemented:
//   - Order and KOT rows are kept for `retentionDays`, never less than 8
//     years (Austrian 7-year retention, counted from the end of the year).
//     Staff screens only show today; the admin keeps the full history.
//   - The purge runs at most once per calendar day (throttled by
//     retention_settings.lastPurgeAt), so today's data is never touched and
//     the cutoff (40 days ago) is always well outside the current day.
//   - It is triggered lazily on kitchen_orders list requests — PocketBase's
//     JSVM has no long-running scheduler, so the purge runs whenever the
//     restaurant uses the system (the KDS polls continuously during service).
//
// What is purged:
//   - kitchen_orders (KOTs)            — by `created`
//   - waiter_orders (billing parents)  — by `created`; cascade-deletes its
//                                        kitchen_orders and kot_counters
//   - orders (customer online orders)  — by `created`
//
// What is NOT touched: menu, categories, accounts/permissions, stock, lots,
// reservations, feedback, staff chat/calls, timesheets, logs, settings, and
// all other restaurant workflows. Billing/payment data lives inside the
// order JSON `items` field and waiter_orders totals, so it is removed
// together with the order row as part of retention.
//
// The 5-hour KDS removal is NOT handled here — it is a non-destructive
// display filter applied client-side in the KDS fetch (KOTs older than
// kotDisplayHours simply leave the active queue but stay in history).
//
// IMPORTANT (JSVM): PocketBase recompiles each hook handler in a separate
// pooled VM, so top-level `function`/`const` declarations in this file are
// NOT in scope inside the handler. Every helper and constant must be defined
// INSIDE the handler body — otherwise the call throws ReferenceError and the
// purge never runs. This is why all logic lives within the handler below.

onRecordsListRequest((e) => {
  // Everything is defined inside the handler so it is in scope when the
  // handler is recompiled in its pooled VM.
  const RETENTION_COLLECTIONS = ["kitchen_orders", "waiter_orders", "orders"];

  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

  const todayKey = () => {
    const d = new Date();
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  };

  const dateKeyOf = (value) => {
    if (!value) return "";
    const d = new Date(String(value));
    if (isNaN(d.getTime())) return "";
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  };

  // "YYYY-MM-DD HH:MM:SS" (UTC) for PocketBase date-field filter comparison.
  const fmtDateTime = (d) =>
    d.getUTCFullYear() +
    "-" +
    pad2(d.getUTCMonth() + 1) +
    "-" +
    pad2(d.getUTCDate()) +
    " " +
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes()) +
    ":" +
    pad2(d.getUTCSeconds());

  const purgeCollection = (app, col, cutoffStr) => {
    let records = [];
    try {
      records = app.findRecordsByFilter(col, "created < {:cutoff}", "", 0, 0, {
        cutoff: cutoffStr,
      });
    } catch (err) {
      const msg = String(err);
      // No matching rows is the normal case — nothing to delete.
      if (msg.indexOf("no rows") !== -1) return;
      app.logger().error("retention fetch failed", "collection", col, "err", msg);
      return;
    }
    for (const r of records) {
      try {
        app.delete(r);
      } catch (_) {
        // Skip a row that cannot be deleted (e.g. a relation constraint from
        // a non-cascading dependency) so the purge continues.
      }
    }
  };

  const cleanupStaleCombinations = (app) => {
    // Active groups with no live (unfreed) orders → close + deactivate.
    let activeGroups = [];
    try {
      activeGroups = app.findRecordsByFilter("table_groups", "status = 'active'", "", 0, 0);
    } catch (_) {
      activeGroups = [];
    }
    for (const grp of activeGroups || []) {
      const gid = grp.id;
      let liveOrders = [];
      try {
        liveOrders = app.findRecordsByFilter(
          "waiter_orders",
          "tableGroup = {:gid} && freed != true",
          "",
          0,
          0,
          { gid },
        );
      } catch (_) {
        liveOrders = [];
      }
      if (liveOrders && liveOrders.length > 0) continue;
      let members = [];
      try {
        members = app.findRecordsByFilter(
          "table_group_members",
          "tableGroup = {:gid} && isActive = true",
          "",
          0,
          0,
          { gid },
        );
      } catch (_) {
        members = [];
      }
      for (const m of members || []) {
        try {
          m.set("isActive", false);
          app.save(m);
        } catch (_) {
          /* skip a member that cannot be updated */
        }
      }
      try {
        grp.set("status", "closed");
        app.save(grp);
      } catch (_) {
        /* already closed */
      }
    }

    // Orphan isActive members whose group is closed/missing — still keep
    // tables marked as Combined until deactivated.
    let orphans = [];
    try {
      orphans = app.findRecordsByFilter("table_group_members", "isActive = true", "", 0, 0);
    } catch (_) {
      orphans = [];
    }
    for (const m of orphans || []) {
      const gid = m.getString("tableGroup") || "";
      if (!gid) {
        try {
          m.set("isActive", false);
          app.save(m);
        } catch (_) {
          /* skip */
        }
        continue;
      }
      let grp = null;
      try {
        grp = app.findRecordById("table_groups", gid);
      } catch (_) {
        grp = null;
      }
      if (!grp || grp.getString("status") === "closed") {
        // Confirm no live order before deactivating.
        let liveOrders = [];
        try {
          liveOrders = app.findRecordsByFilter(
            "waiter_orders",
            "tableGroup = {:gid} && freed != true",
            "",
            0,
            0,
            { gid },
          );
        } catch (_) {
          liveOrders = [];
        }
        if (!liveOrders || liveOrders.length === 0) {
          try {
            m.set("isActive", false);
            app.save(m);
          } catch (_) {
            /* skip */
          }
        }
      }
    }
  };

  const maybePurge = (app) => {
    let settings = null;
    try {
      settings = app.findFirstRecordByFilter("retention_settings", "id != ''");
    } catch (_) {
      // Collection not ready yet (migration not applied). Skip silently.
      return;
    }
    if (!settings) return;

    const last = settings.getString("lastPurgeAt") || "";
    if (dateKeyOf(last) === todayKey()) return; // already purged today

    // Austrian BAO: business records are kept 7 years from the end of the
    // calendar year, so nothing younger than 8 years is ever deleted,
    // whatever the setting says.
    const MIN_DAYS = 2922;
    const retentionDays = Math.max(settings.getInt("retentionDays") || MIN_DAYS, MIN_DAYS);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffStr = fmtDateTime(cutoff);

    for (const col of RETENTION_COLLECTIONS) {
      purgeCollection(app, col, cutoffStr);
    }

    // After purging old orders, release table combinations that no longer
    // have any live (unfreed) parent order. This clears the
    // table_group_members.isActive flag and closes the table_groups row so
    // tables are selectable again — without it, freed/deleted orders leave
    // members stuck "active" and the Waiter UI keeps marking those tables
    // as part of a combination. Mirrors the frontend
    // cleanupStaleCombinations() but runs server-side on the purge so it
    // does not depend on a Waiter dashboard being open.
    cleanupStaleCombinations(app);

    settings.set("lastPurgeAt", new Date().toISOString());
    try {
      app.save(settings);
    } catch (err) {
      app.logger().error("retention settings save failed", "err", String(err));
    }
  };

  try {
    maybePurge($app);
  } catch (err) {
    $app.logger().error("retention purge hook failed", "err", String(err));
  }
  e.next();
}, "kitchen_orders");
