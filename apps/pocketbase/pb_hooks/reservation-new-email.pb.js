/// <reference path="../pb_data/types.d.ts" />

// Sends an automated email to the restaurant admin inbox when a new table
// reservation is created, so staff are notified even when not viewing the
// reservations page.
onRecordAfterCreateSuccess((e) => {
  try {
    const ADMIN_EMAIL = "triptifoodtech@gmail.com";

    const guestName = e.record.get("guestName") || "Guest";
    const guestEmail = e.record.get("email") || "";
    const guestPhone = e.record.get("phone") || "";
    const date = e.record.get("reservationDate") || "";
    const time = e.record.get("reservationTime") || "";
    const partySize = e.record.get("partySize") || e.record.get("numberOfGuests") || "";
    const assignedTable = e.record.get("assignedTable") || "";
    const code = e.record.get("reservationCode") || "";

    const dateStr = date ? String(date).substring(0, 10) : "";

    let adminUrl = "";
    try {
      adminUrl = ($app.settings().meta.appUrl || "") + "/admin/reservations";
    } catch (_) {
      adminUrl = "/admin/reservations";
    }

    let tableName = assignedTable;
    if (assignedTable) {
      try {
        const t = $app.findRecordById("table_configurations", assignedTable);
        if (t) {
          tableName = t.get("name") + " (" + t.get("room") + ")";
        }
      } catch (_) {
        /* keep raw id */
      }
    }

    const html =
      "<div style=\"font-family:Arial,sans-serif;color:#3a1420;max-width:560px;margin:0 auto\">" +
      "<h2 style=\"color:#8B1538\">New Reservation Request</h2>" +
      "<p>A new table reservation needs your attention.</p>" +
      "<table style=\"width:100%;border-collapse:collapse\">" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Guest name</td><td>" + guestName + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Guest email</td><td>" + guestEmail + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Guest phone</td><td>" + guestPhone + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Date &amp; time</td><td>" + dateStr + " at " + time + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Guests</td><td>" + partySize + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Table assigned</td><td>" + (tableName || "Not assigned yet") + "</td></tr>" +
      "<tr><td style=\"padding:6px 0;font-weight:bold\">Code</td><td>" + code + "</td></tr>" +
      "</table>" +
      "<p style=\"margin-top:20px\"><a href=\"" + adminUrl + "\" style=\"background:#8B1538;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold\">Open Admin Dashboard</a></p>" +
      "<p style=\"font-size:12px;color:#777;margin-top:16px\">Please approve or decline this reservation from the admin dashboard.</p>" +
      "</div>";

    const message = new MailerMessage({
      from: { name: "Tripti Genusswelt Reservations" },
      to: [{ address: ADMIN_EMAIL }],
      subject: "New reservation from " + guestName + " \u2022 " + dateStr + " " + time,
      html: html,
    });

    try {
      $app.newMailClient().send(message);
      $app.logger().info("New reservation admin email sent", "to", ADMIN_EMAIL);
    } catch (err) {
      $app.logger().error("New reservation admin email failed", "err", String(err));
    }
  } catch (err) {
    $app.logger().error("reservation-new-email hook error", "err", String(err));
  }

  e.next();
}, "table_reservations");
