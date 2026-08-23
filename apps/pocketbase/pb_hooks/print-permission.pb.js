/// <reference path="../pb_data/types.d.ts" />

// Server-side enforcement of the Restaurant-wide Printing master switch.
//
// KOT printing itself is a client-side browser action (iframe print via
// kotPrint.js), so it cannot be gated on the server. But every print /
// reprint / "Send Again" event is tracked by writing `printedAt` and
// `printCount` on the kitchen_orders record. This hook blocks those
// tracking writes when the admin has turned Restaurant-wide Printing OFF,
// so the restriction cannot be bypassed through a direct API call — a
// waiter or KDS client that tries to record a print event while printing
// is disabled is rejected with a 400.
//
// admin_users always retain full print access (they are not subject to the
// master switch), so admin updates are allowed through unchanged. Only
// waiter_users and kds_users are gated.
//
// This complements the client-side hiding/disabling of print controls in
// the Waiter (OrderPlacement) and Kitchen (KdsDashboard) interfaces, which
// both read the same single print_settings record via usePrintSettings.

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo.auth;
  const isAdmin = !!auth && auth.get("collectionName") === "admin_users";

  // Admins always pass — they retain full print access regardless of the
  // master switch.
  if (isAdmin) {
    e.next();
    return;
  }

  // Only gate updates that actually touch the print-tracking fields. Read
  // the stored record to compare against the incoming merged record.
  let stored;
  try {
    stored = $app.findRecordById("kitchen_orders", e.record.getId());
  } catch (_) {
    // If the record can't be found, let the normal flow handle it.
    e.next();
    return;
  }

  const newPrintedAt = e.record.get("printedAt") || "";
  const oldPrintedAt = stored.get("printedAt") || "";
  const newPrintCount = Number(e.record.get("printCount") || 0);
  const oldPrintCount = Number(stored.get("printCount") || 0);

  const touchesPrintTracking =
    String(newPrintedAt) !== String(oldPrintedAt) ||
    newPrintCount !== oldPrintCount;

  if (!touchesPrintTracking) {
    e.next();
    return;
  }

  // Load the single print_settings record (the same one the admin UI and
  // the client hooks read). Default to "printing on" when no record exists.
  let restaurantWideEnabled = true;
  try {
    const settings = $app.findRecordsByFilter(
      "print_settings",
      "id != ''",
      "",
      1,
    );
    if (settings && settings.length > 0) {
      restaurantWideEnabled = settings[0].get("restaurantWidePrintEnabled") !== false;
    }
  } catch (_) {
    // If we can't read settings, fail open (allow) to avoid blocking
    // unrelated kitchen_orders updates.
    e.next();
    return;
  }

  if (!restaurantWideEnabled) {
    throw new BadRequestError(
      "KOT printing is currently disabled by the administrator. Print and reprint actions are not allowed.",
    );
  }

  e.next();
}, "kitchen_orders");
