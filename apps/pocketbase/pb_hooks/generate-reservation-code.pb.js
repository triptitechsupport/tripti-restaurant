/// <reference path="../pb_data/types.d.ts" />
onRecordCreate((e) => {
  let code;
  let isUnique = false;
  
  // Generate a unique 5-digit code
  while (!isUnique) {
    // Generate random number between 00001 and 99999
    code = String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
    
    // Check if code already exists
    try {
      const existing = $app.findFirstRecordByFilter("table_reservations", "reservationCode = '" + code + "'");
      if (!existing) {
        isUnique = true;
      }
    } catch (err) {
      // No record found, code is unique
      isUnique = true;
    }
  }
  
  // Set the generated code
  e.record.set("reservationCode", code);
  e.next();
}, "table_reservations");