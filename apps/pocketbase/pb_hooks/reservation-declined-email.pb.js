/// <reference path="../pb_data/types.d.ts" />
onRecordAfterUpdateSuccess((e) => {
  // Only send email if status was changed to 'Declined'
  const original = e.record.original();
  const currentStatus = e.record.get("status");
  
  if (currentStatus === "Declined" && original.get("status") !== "Declined") {
    // Prepare decline details
    const declineDetails = {
      id: e.record.id,
      guestName: e.record.get("guestName"),
      email: e.record.get("email"),
      phone: e.record.get("phone"),
      reservationDate: e.record.get("reservationDate"),
      reservationTime: e.record.get("reservationTime"),
      numberOfGuests: e.record.get("numberOfGuests"),
      partySize: e.record.get("partySize"),
      adminNotes: e.record.get("adminNotes") || ""
    };
    
    // Call the decline email endpoint
    try {
      const http = require("http");
      const https = require("https");
      const url = "http://localhost:8090/reservations/send-decline-email";
      
      const postData = JSON.stringify(declineDetails);
      const options = {
        hostname: "localhost",
        port: 8090,
        path: "/reservations/send-decline-email",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          console.log("Decline email sent for reservation " + e.record.id);
        });
      });
      
      req.on("error", (error) => {
        console.error("Error sending decline email: " + error.message);
      });
      
      req.write(postData);
      req.end();
    } catch (error) {
      console.error("Failed to send decline email: " + error.message);
    }
  }
  
  e.next();
}, "table_reservations");