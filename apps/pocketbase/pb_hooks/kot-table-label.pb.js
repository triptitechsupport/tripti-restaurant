/// <reference path="../pb_data/types.d.ts" />

// Stamp the full combined-table designation onto a new KOT when the client
// only sent the primary table. Shared and Linked orders keep their member
// list on table_groups.label ("Tables 4 + 5"). Without this, the KDS screen
// and kitchen print fall back to kitchen_orders.tableNumber and show one table.
onRecordCreateRequest((e) => {
  const existing = e.record.getString("tableLabel") || "";
  if (existing.indexOf("+") !== -1) {
    e.next();
    return;
  }
  const asId = (value) => {
    if (value == null || value === "") return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return asId(value[0]);
    if (typeof value === "object" && value.id) return String(value.id);
    return String(value);
  };
  let parentId = asId(e.record.get("parentOrder"));
  if (!parentId) {
    try {
      const info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
      const body = info && info.body ? info.body : null;
      parentId = asId(body && (body.parentOrder || body["parentOrder"]));
    } catch (_) {
      parentId = parentId || "";
    }
  }
  if (parentId && !asId(e.record.get("parentOrder"))) {
    e.record.set("parentOrder", String(parentId));
  }
  if (!parentId) {
    e.next();
    return;
  }
  try {
    const parent = $app.findRecordById("waiter_orders", parentId);
    const gid = parent.get("tableGroup");
    if (gid) {
      const group = $app.findRecordById("table_groups", gid);
      const label = group.getString("label") || "";
      if (label.indexOf("+") !== -1) {
        e.record.set("tableLabel", label);
      }
    }
  } catch (_) {
    // Missing parent/group must not block KOT creation.
  }
  e.next();
}, "kitchen_orders");
