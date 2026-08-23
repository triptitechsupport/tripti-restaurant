/// <reference path="../pb_data/types.d.ts" />
onRecordAfterCreateSuccess((e) => {
  const now = new Date();
  
  try {
    const records = $app.findRecordsByFilter("otps", "expiration_time < @now", { "@now": now.toISOString() });
    
    for (const record of records) {
      $app.delete(record);
    }
  } catch (err) {
    console.log("OTP cleanup error: " + err.message);
  }
  
  e.next();
}, "otps");