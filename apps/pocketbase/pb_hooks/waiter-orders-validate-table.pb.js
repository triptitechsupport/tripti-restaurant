/// <reference path="../pb_data/types.d.ts" />

// Server-side validation: a new waiter_orders parent Order can only be
// created for a table that exists AND is active in the Admin-configured
// table_configurations list.
//
// This is the creation-boundary enforcement that complements the UI's
// occupied-table gating. It blocks raw API clients (or a waiter bypassing
// the dropdown) from opening an order on a table that is not configured or
// is marked inactive in the Admin Panel — the table_configurations list is
// the single source of which tables exist.
//
// tableNumber on waiter_orders stores the table_configurations `name`
// (e.g. "T1"), so the match is by name. If the Admin has not configured any
// tables at all (fresh install), validation is skipped to preserve the
// numeric fallback until tables are configured.

onRecordCreateRequest((e) => {
  const tableNumber = e.record.get("tableNumber");
  if (!tableNumber || String(tableNumber).trim() === "") {
    // The required-field check is enforced by the collection schema; let it
    // surface the validation error rather than duplicating it here.
    e.next();
    return;
  }

  // Resolve the matching table_configurations record by name.
  let table = null;
  try {
    table = $app.findFirstRecordByFilter(
      "table_configurations",
      "name = {:name}",
      { name: String(tableNumber) },
    );
  } catch (_) {
    table = null;
  }

  if (table) {
    // Match the UI's active semantics: a table is active unless isActive is
    // explicitly false (unset/null is treated as active).
    const isActive = table.get("isActive");
    if (isActive === false) {
      throw new BadRequestError(
        "Table " +
          tableNumber +
          " is currently inactive. Only active admin-configured tables can be used for a new order.",
      );
    }
    e.next();
    return;
  }

  // No matching table. If the Admin has configured at least one table, the
  // chosen table is invalid. If no tables are configured at all, fall back
  // to allowing the create (fresh-install numeric behaviour).
  let anyTables = false;
  try {
    $app.findFirstRecordByFilter("table_configurations", "name != ''");
    anyTables = true;
  } catch (_) {
    anyTables = false;
  }

  if (anyTables) {
    throw new BadRequestError(
      "Table " +
        tableNumber +
        " is not configured in the Admin Panel. Only active admin-configured tables can be used for a new order.",
    );
  }

  e.next();
}, "waiter_orders");
