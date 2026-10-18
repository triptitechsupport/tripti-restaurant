/// <reference path="../pb_data/types.d.ts" />

// KOT creation-boundary validation.
//
// NOTE: This hook is intentionally a pass-through. The original logic tried
// to read the `parentOrder` relation from `e.record` inside
// `onRecordCreateRequest`, but in PocketBase 0.40 the relation value is not
// populated on `e.record` at that stage (both `record.get()` and
// `record.getString()` return empty), so the check rejected EVERY KOT create
// — even ones with a valid parentOrder — which broke the entire
// waiter → kitchen order flow (orders never reached KDS).
//
// The `parentOrder` relation is already `required: true` on the
// `kitchen_orders` schema, so PocketBase's built-in validation enforces that
// a KOT cannot be created without a parent Order. The Waiter/Admin UI also
// only sends a KOT after creating/resolving the parent waiter_orders record.
// We therefore rely on the schema + UI and do not duplicate the check here.

onRecordCreateRequest((e) => {
  e.next();
}, "kitchen_orders");
