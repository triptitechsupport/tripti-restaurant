/// <reference path="../pb_data/types.d.ts" />

// Repair migration: re-add the kitchen_orders fields that earlier migrations
// recorded as applied but did not actually persist on the collection
// (parentOrder, kotSuffix, tableLabel, itemStatuses, printedAt, printCount,
// and the "cancelled" status value).
//
// Without `parentOrder`, every newly created KOT is orphaned from its
// waiter_orders parent — the kot-suffix hook cannot generate a per-parent
// suffix, KDS cannot expand the parent (table / waiter / Order ID), and the
// Waiter Active tab cannot group KOTs by parent. This breaks the entire
// waiter → kitchen flow, most visibly for combined (Linked / Shared) tables.
//
// This migration is idempotent: each field is added only when absent, so it
// is safe whether or not the original migrations persisted. It does not
// touch existing data — all added columns are nullable / optional.

migrate(
  (app) => {
    const kitchenOrders = app.findCollectionByNameOrId("kitchen_orders");
    const waiterOrders = app.findCollectionByNameOrId("waiter_orders");
    let changed = false;

    // parentOrder — relation to waiter_orders (the parent Order). Not
    // required so legacy unparented KOTs remain valid; cascadeDelete keeps
    // KOTs consistent when a parent order is deleted.
    if (!kitchenOrders.fields.getByName("parentOrder")) {
      kitchenOrders.fields.add(
        new RelationField({
          name: "parentOrder",
          required: false,
          maxSelect: 1,
          collectionId: waiterOrders.id,
          cascadeDelete: true,
        }),
      );
      changed = true;
    }

    // kotSuffix — per-parent KOT sequence (001, 002, ...), set by the
    // kot-suffix hook so multiple KOTs on one order display as WI00123_001.
    if (!kitchenOrders.fields.getByName("kotSuffix")) {
      kitchenOrders.fields.add(
        new TextField({
          name: "kotSuffix",
          required: false,
          max: 3,
        }),
      );
      changed = true;
    }

    // tableLabel — persisted combined-table designation ("Tables 4 + 5 + 6")
    // so KDS and kitchen print show every member table, not just the primary.
    if (!kitchenOrders.fields.getByName("tableLabel")) {
      kitchenOrders.fields.add(
        new TextField({
          name: "tableLabel",
          required: false,
          max: 300,
        }),
      );
      changed = true;
    }

    // itemStatuses — per-item preparation/pickup status JSON, the single
    // source of truth for item-level KOT tracking across KDS / Waiter / Admin.
    if (!kitchenOrders.fields.getByName("itemStatuses")) {
      kitchenOrders.fields.add(
        new JSONField({
          name: "itemStatuses",
          required: false,
          maxSize: 2000000,
        }),
      );
      changed = true;
    }

    // printedAt — timestamp of the last print/reprint event.
    if (!kitchenOrders.fields.getByName("printedAt")) {
      kitchenOrders.fields.add(
        new DateField({
          name: "printedAt",
          required: false,
        }),
      );
      changed = true;
    }

    // printCount — number of times the KOT has been printed/sent.
    if (!kitchenOrders.fields.getByName("printCount")) {
      kitchenOrders.fields.add(
        new NumberField({
          name: "printCount",
          required: false,
          min: 0,
        }),
      );
      changed = true;
    }

    // status — ensure "cancelled" is an accepted value so a child KOT can be
    // cancelled (status = cancelled) without deleting the record. Existing
    // values are preserved; "cancelled" is appended when absent.
    const statusField = kitchenOrders.fields.getByName("status");
    if (statusField) {
      const current = statusField.values || [];
      const hasCancelled = (current || []).some(
        (v) => String(v) === "cancelled",
      );
      if (!hasCancelled) {
        const nextValues = (current && current.slice) ? current.slice() : [];
        nextValues.push("cancelled");
        statusField.values = nextValues;
        changed = true;
      }
    }

    if (changed) {
      app.save(kitchenOrders);
    }
  },
  (app) => {
    // Down: remove only the fields this migration added. The status
    // "cancelled" value is left in place on rollback so historical
    // cancelled KOTs remain valid.
    const kitchenOrders = app.findCollectionByNameOrId("kitchen_orders");
    [
      "parentOrder",
      "kotSuffix",
      "tableLabel",
      "itemStatuses",
      "printedAt",
      "printCount",
    ].forEach((name) => {
      if (kitchenOrders.fields.getByName(name)) {
        kitchenOrders.fields.removeByName(name);
      }
    });
    app.save(kitchenOrders);
  },
);
