/// <reference path="../pb_data/types.d.ts" />
onRecordAfterUpdateSuccess((e) => {
  // Only send email if status was changed to 'Approved'
  const original = e.record.original();
  const currentStatus = e.record.get("status");
  
  if (currentStatus === "Approved" && original.get("status") !== "Approved") {
    // Prepare reservation details
    const reservationDetails = {
      id: e.record.id,
      guestName: e.record.get("guestName"),
      email: e.record.get("email"),
      phone: e.record.get("phone"),
      reservationDate: e.record.get("reservationDate"),
      reservationTime: e.record.get("reservationTime"),
      numberOfGuests: e.record.get("numberOfGuests"),
      partySize: e.record.get("partySize")
    };
    
    // Call the confirmation email endpoint
    try {
      const http = require("http");
      const https = require("https");
      const url = "http://localhost:8090/reservations/send-confirmation-email";
      
      const postData = JSON.stringify(reservationDetails);
      const options = {
        hostname: "localhost",
        port: 8090,
        path: "/reservations/send-confirmation-email",
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
          console.log("Confirmation email sent for reservation " + e.record.id);
        });
      });
      
      req.on("error", (error) => {
        console.error("Error sending confirmation email: " + error.message);
      });
      
      req.write(postData);
      req.end();
    } catch (error) {
      console.error("Failed to send confirmation email: " + error.message);
    }
  }
  
  e.next();
}, "table_reservations");