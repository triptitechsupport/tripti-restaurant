/// <reference path="../pb_data/types.d.ts" />

// KOT creation-boundary validation.
//
// A new kitchen_orders KOT must NOT be created unless its parent
// waiter_orders record has a valid (non-null, non-empty) tableNumber.
// This is server-side enforcement at the creation boundary — not just UI
// hiding — so invalid KOTs can never land in the kitchen_orders collection
// regardless of which client (waiter, admin, or raw API) attempts the create.
//
// The parent is resolved through the existing `parentOrder` relation on
// kitchen_orders (never by parsing the Order ID string). If parentOrder is
// missing or the parent's tableNumber is null/empty, the create is rejected
// with a 400 BadRequestError and the record is not persisted.

onRecordCreateRequest((e) => {
  const parentId = e.record.get("parentOrder");

  // Every new KOT must be linked to a parent waiter_orders record.
  if (!parentId) {
    throw new BadRequestError(
      "KOT cannot be created without a parent Order (parentOrder relation is required).",
    );
  }

  // Resolve the parent Order through the relation and validate its
  // tableNumber. findRecordById throws if the parent does not exist.
  let parent;
  try {
    parent = $app.findRecordById("waiter_orders", parentId);
  } catch (_) {
    throw new BadRequestError(
      "Parent Order not found for KOT — cannot create a KOT without a valid parent Order.",
    );
  }

  const tableNumber = parent.getString("tableNumber");
  if (!tableNumber || String(tableNumber).trim() === "") {
    throw new BadRequestError(
      "KOT cannot be created: the parent Order has no valid table number. Assign a table to the order before sending to the kitchen.",
    );
  }

  e.next();
}, "kitchen_orders");
