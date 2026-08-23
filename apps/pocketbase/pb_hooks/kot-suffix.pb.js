/// <reference path="../pb_data/types.d.ts" />

// Atomically generates a per-parent KOT suffix (001, 002, 003 ...) for each
// new kitchen_orders record that is linked to a waiter_orders parent via the
// parentOrder relation. The suffix is scoped per parent so multiple KOTs can
// be added to a single open order and displayed as WI00123_001, _002, ...
//
// Atomicity: a single SQLite UPDATE...RETURNING on the kot_counters row
// serializes concurrent increments, so two KOTs created at the same time for
// the same parent can never receive the same suffix. The counter row is
// created on first use (find-or-create with a unique index guarding the race;
// a concurrent first-create that loses the race re-finds the winner's row).

onRecordCreateRequest((e) => {
  const parentId = e.record.get("parentOrder");
  if (!parentId) {
    // Legacy KOT with no parent — no suffix. Leave kotSuffix unset.
    e.next();
    return;
  }

  const kotCounters = $app.findCollectionByNameOrId("kot_counters");

  let counter;
  try {
    counter = $app.findFirstRecordByFilter(
      "kot_counters",
      "parentOrder = {:pid}",
      { pid: parentId },
    );
  } catch (_) {
    // No counter row yet — this is the first KOT for this parent. Create one
    // starting at 0; the increment below makes the first suffix 001.
    try {
      counter = new Record(kotCounters, { parentOrder: parentId, nextSeq: 0 });
      $app.save(counter);
    } catch (createErr) {
      // Race: another concurrent create won and inserted the row. Re-find it.
      counter = $app.findFirstRecordByFilter(
        "kot_counters",
        "parentOrder = {:pid}",
        { pid: parentId },
      );
    }
  }

  // Atomic read-increment-write in one SQL statement. RETURNING yields the
  // new (post-increment) nextSeq, which is the suffix sequence for THIS KOT.
  const row = new DynamicModel({ nextSeq: 0 });
  $app
    .db()
    .newQuery(
      "UPDATE kot_counters SET nextSeq = nextSeq + 1 WHERE id = {:id} RETURNING nextSeq",
    )
    .bind({ id: counter.id })
    .one(row);

  if (!row || !row.nextSeq) {
    throw new BadRequestError(
      "KOT suffix counter not initialized for parentOrder: " + parentId,
    );
  }

  const seq = parseInt(row.nextSeq, 10);
  e.record.set("kotSuffix", String(seq).padStart(3, "0"));

  e.next();
}, "kitchen_orders");
