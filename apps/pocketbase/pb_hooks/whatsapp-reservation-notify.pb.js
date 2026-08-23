/// <reference path="../pb_data/types.d.ts" />

// Sends a WhatsApp notification to the admin when a new table reservation is created.
// Uses the free CallMeBot WhatsApp API. The admin configures their number and API key
// in Admin Settings (stored in the `notification_settings` collection).
onRecordAfterCreateSuccess((e) => {
  try {
    let settings;
    try {
      settings = $app.findFirstRecordByFilter("notification_settings", "id != ''");
    } catch (_) {
      settings = null;
    }

    if (!settings) {
      e.next();
      return;
    }

    const enabled = settings.get("whatsappEnabled");
    const phone = (settings.get("whatsappNumber") || "").toString().trim();
    const apiKey = (settings.get("whatsappApiKey") || "").toString().trim();

    if (!enabled || !phone || !apiKey) {
      e.next();
      return;
    }

    const guestName = e.record.get("guestName") || "Guest";
    const date = e.record.get("reservationDate") || "";
    const time = e.record.get("reservationTime") || "";
    const partySize = e.record.get("partySize") || e.record.get("numberOfGuests") || "";
    const code = e.record.get("reservationCode") || "";

    const dateStr = date ? String(date).substring(0, 10) : "";

    const message =
      "New reservation request needs your attention!\n\n" +
      "Guest: " + guestName + "\n" +
      "Date: " + dateStr + " at " + time + "\n" +
      "Party size: " + partySize + "\n" +
      "Code: " + code + "\n\n" +
      "Please open the admin dashboard to approve or decline.";

    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    const url =
      "https://api.callmebot.com/whatsapp.php?phone=" +
      encodeURIComponent(cleanPhone) +
      "&text=" +
      encodeURIComponent(message) +
      "&apikey=" +
      encodeURIComponent(apiKey);

    try {
      $http.send({ url: url, method: "GET", timeout: 15 });
      $app.logger().info("WhatsApp reservation notification sent", "to", cleanPhone);
    } catch (err) {
      $app.logger().error("WhatsApp reservation notification failed", "err", String(err));
    }
  } catch (err) {
    $app.logger().error("whatsapp-reservation-notify hook error", "err", String(err));
  }

  e.next();
}, "table_reservations");
