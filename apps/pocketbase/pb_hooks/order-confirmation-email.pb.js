/// <reference path="../pb_data/types.d.ts" />

// Emails to the guest about an online order. Sent only when the mail server
// is set up in PocketBase (Settings > Mail); a mail error never blocks the order.
// Pickup orders get an email when they arrive, when staff confirm them, when
// they are ready and when they are cancelled.

onRecordAfterCreateSuccess((e) => {
  try {
    const kind = e.record.getString("orderType") === "pickup"
      ? (e.record.getString("status") === "confirmed" ? "confirmed" : "received")
      : "confirmed";
    require(`${__hooks}/order-mail.js`).tgOrderMail(e.record, kind);
  } catch (error) {
    console.log("Order email failed: " + error);
  }
  e.next();
}, "orders");

onRecordAfterUpdateSuccess((e) => {
  try {
    if (e.record.getString("orderType") === "pickup") {
      const before = e.record.original().getString("status");
      const now = e.record.getString("status");
      if (before !== now && (now === "confirmed" || now === "ready" || now === "cancelled")) {
        // "confirmed" after "received" only; release to the kitchen is not news for the guest.
        if (now !== "confirmed" || before === "received") require(`${__hooks}/order-mail.js`).tgOrderMail(e.record, now);
      }
    }
  } catch (error) {
    console.log("Order status email failed: " + error);
  }
  e.next();
}, "orders");
