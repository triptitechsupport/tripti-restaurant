/// <reference path="../pb_data/types.d.ts" />

// ──────────────────────────────────────────────────────────────────────────
// Menu items field synchronisation — keeps the shared menu consistent for
// EVERY client that reads the `menu_items` collection: the public website,
// the waiter ordering screen, Admin Menu Management, and the connected
// Tripti Waiter Android app (which talks to this same PocketBase at
// /hcgi/platform).
//
// Problem this solves:
//   The collection carries BOTH legacy fields (name, description) and
//   bilingual fields (nameEN, nameDE, descriptionEN, descriptionDE). The
//   existing enrich hook only fills bilingual-from-legacy on READ and does
//   not persist, so:
//     • an item edited directly in the PocketBase dashboard (setting only
//       nameEN) left the legacy `name` stale — any client/app reading
//       `name` saw an old label while the website showed the new one;
//     • a blank German field stayed blank for German-reading clients.
//
// English (nameEN / descriptionEN) is the source of truth set by Admin Menu
// Management. This hook:
//   • mirrors the legacy `name` / `description` to the English values so
//     older clients/apps that read the legacy fields always see current data;
//   • back-fills nameEN/descriptionEN from the legacy fields when only those
//     were set (so the bilingual fields are never empty);
//   • falls German (nameDE/descriptionDE) back to English when blank so a
//     German-reading client never sees an empty label.
//
// `category` and `availability` are single fields already written directly by
// Admin Menu Management, so they are already identical for every reader — no
// mirroring is needed for them. This hook only normalises the name/description
// field variants.
//
// It runs on create + update (persisted to the DB) AND on enrich (read), so
// even records last edited outside the website form stay consistent for the
// Android app without requiring an app-side change. It is idempotent: for
// items saved through the website MenuItemForm (which already sets
// name=nameEN and description=descriptionEN) it is a no-op.
//
// NOTE: pb_hooks handlers are recompiled in isolated VMs, so the sync logic
// is inlined into each handler (no shared top-level helper).
// ──────────────────────────────────────────────────────────────────────────

onRecordCreate((e) => {
  const record = e.record;

  const nameEN = (record.get("nameEN") || "").trim();
  const name = (record.get("name") || "").trim();
  const canonicalName = nameEN || name;
  if (canonicalName) {
    if (!nameEN) record.set("nameEN", canonicalName);
    if (name !== canonicalName) record.set("name", canonicalName);
  }

  const descEN = (record.get("descriptionEN") || "").trim();
  const desc = (record.get("description") || "").trim();
  const canonicalDesc = descEN || desc;
  if (canonicalDesc) {
    if (!descEN) record.set("descriptionEN", canonicalDesc);
    if (desc !== canonicalDesc) record.set("description", canonicalDesc);
  }

  if (!(record.get("nameDE") || "").trim()) {
    record.set("nameDE", canonicalName || "");
  }
  if (!(record.get("descriptionDE") || "").trim()) {
    record.set("descriptionDE", canonicalDesc || "");
  }

  e.next();
}, "menu_items");

onRecordUpdate((e) => {
  const record = e.record;

  const nameEN = (record.get("nameEN") || "").trim();
  const name = (record.get("name") || "").trim();
  const canonicalName = nameEN || name;
  if (canonicalName) {
    if (!nameEN) record.set("nameEN", canonicalName);
    if (name !== canonicalName) record.set("name", canonicalName);
  }

  const descEN = (record.get("descriptionEN") || "").trim();
  const desc = (record.get("description") || "").trim();
  const canonicalDesc = descEN || desc;
  if (canonicalDesc) {
    if (!descEN) record.set("descriptionEN", canonicalDesc);
    if (desc !== canonicalDesc) record.set("description", canonicalDesc);
  }

  if (!(record.get("nameDE") || "").trim()) {
    record.set("nameDE", canonicalName || "");
  }
  if (!(record.get("descriptionDE") || "").trim()) {
    record.set("descriptionDE", canonicalDesc || "");
  }

  e.next();
}, "menu_items");

onRecordEnrich((e) => {
  const record = e.record;

  const nameEN = (record.get("nameEN") || "").trim();
  const name = (record.get("name") || "").trim();
  const canonicalName = nameEN || name;
  if (canonicalName) {
    if (!nameEN) record.set("nameEN", canonicalName);
    if (name !== canonicalName) record.set("name", canonicalName);
  }

  const descEN = (record.get("descriptionEN") || "").trim();
  const desc = (record.get("description") || "").trim();
  const canonicalDesc = descEN || desc;
  if (canonicalDesc) {
    if (!descEN) record.set("descriptionEN", canonicalDesc);
    if (desc !== canonicalDesc) record.set("description", canonicalDesc);
  }

  if (!(record.get("nameDE") || "").trim()) {
    record.set("nameDE", canonicalName || "");
  }
  if (!(record.get("descriptionDE") || "").trim()) {
    record.set("descriptionDE", canonicalDesc || "");
  }

  e.next();
}, "menu_items");
