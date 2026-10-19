// Helper for order-confirmation-email.pb.js (PocketBase runs each hook in its
// own context, so shared code is loaded with require()).

function tgOrderMail(record, kind) {
  const meta = $app.settings().meta;
  const senderAddress = meta.senderAddress;
  const senderName = meta.senderName || "Tripti Genusswelt";
  const to = record.getString("customerEmail");
  if (!to || !senderAddress) return;

  const de = record.getString("lang") !== "en";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => (de ? (Number(n) || 0).toFixed(2).replace(".", ",") + " €" : "€" + (Number(n) || 0).toFixed(2));
  const no = record.getString("orderNumber");
  const pickup = record.getString("orderType") === "pickup";
  let when = "";
  if (pickup) {
    const d = record.getString("pickupDate").split("-");
    when = (d.length === 3 ? d[2] + "." + d[1] + "." + d[0] : record.getString("pickupDate")) + ", " + record.getString("pickupTime") + (de ? " Uhr" : "");
  }

  let items = [];
  try { items = JSON.parse(record.getString("items") || "[]"); } catch (_) { items = []; }
  let rows = "";
  items.forEach((it) => {
    const name = de ? (it.nameDE || it.name) : (it.nameEN || it.name);
    rows += "<tr><td style='padding:4px 12px 4px 0'>" + esc(it.quantity) + " × " + esc(name) + "</td><td style='text-align:right'>" + money((Number(it.price) || 0) * (Number(it.quantity) || 1)) + "</td></tr>";
  });

  const T = de ? {
    received: ["Bestellung eingegangen", "Danke! Wir haben Ihre Bestellung erhalten und bestätigen sie in Kürze."],
    confirmed: ["Bestellung bestätigt", "Danke! Ihre Bestellung ist bestätigt. Wir kochen sie frisch für Ihre Abholzeit."],
    ready: ["Ihre Bestellung ist abholbereit", "Ihre Bestellung ist fertig und wartet auf Sie."],
    cancelled: ["Bestellung storniert", "Ihre Bestellung wurde leider storniert."],
    pickupAt: "Abholung", total: "Summe", pay: "Bezahlung bei Abholung (bar oder Karte).",
    addr: "Tripti Genusswelt · Italiener Straße 17 · 9500 Villach",
    reason: "Grund",
  } : {
    received: ["Order received", "Thank you! We have received your order and will confirm it shortly."],
    confirmed: ["Order confirmed", "Thank you! Your order is confirmed. We will cook it fresh for your pickup time."],
    ready: ["Your order is ready", "Your order is ready and waiting for you."],
    cancelled: ["Order cancelled", "Unfortunately your order has been cancelled."],
    pickupAt: "Pickup", total: "Total", pay: "Pay when you pick up (cash or card).",
    addr: "Tripti Genusswelt · Italiener Straße 17 · 9500 Villach, Austria",
    reason: "Reason",
  };
  const pair = T[kind] || T.confirmed;
  const reason = kind === "cancelled" && record.getString("cancelReason")
    ? "<p><b>" + T.reason + ":</b> " + esc(record.getString("cancelReason")) + "</p>" : "";

  // Link to the guest's status page (only when the site address is set in PocketBase settings).
  const base = String(meta.appURL || "").replace(/\/+$/, "");
  const token = record.getString("publicToken");
  const link = pickup && token && base && base.indexOf("localhost") === -1 && base.indexOf("127.0.0.1") === -1
    ? "<p><a style='color:#650f1f' href='" + esc(base + "/order-confirmation/" + record.id + "?t=" + token) + "'>" + (de ? "Status Ihrer Bestellung ansehen" : "See your order status") + "</a></p>"
    : "";

  const html =
    "<div style='font-family:Georgia,serif;color:#3a1a12;max-width:560px'>" +
    "<h2 style='color:#650f1f'>" + pair[0] + " · " + esc(no) + "</h2>" +
    "<p>" + pair[1] + "</p>" + reason +
    (pickup ? "<p><b>" + T.pickupAt + ":</b> " + esc(when) + "<br>" + T.addr + "</p>" : "") +
    "<table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px'>" + rows +
    "<tr><td style='padding-top:8px'><b>" + T.total + "</b></td><td style='text-align:right;padding-top:8px'><b>" + money(record.get("totalPrice")) + "</b></td></tr></table>" +
    (pickup && kind !== "cancelled" ? "<p>" + T.pay + "</p>" : "") + link +
    "<p style='color:#7a5a48'>+43 664 1219289</p></div>";

  const message = new MailerMessage({
    from: { address: senderAddress, name: senderName },
    to: [{ address: to }],
    subject: pair[0] + " " + no + (pickup ? " · " + when : ""),
    html: html,
  });
  $app.newMailClient().send(message);
}

module.exports = { tgOrderMail };
