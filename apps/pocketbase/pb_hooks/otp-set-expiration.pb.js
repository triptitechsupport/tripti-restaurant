/// <reference path="../pb_data/types.d.ts" />
onRecordCreate((e) => {
  // Log hook execution
  console.log("[OTP Expiration Hook] Setting OTP expiration time to 30 seconds from now");
  
  try {
    // Calculate expiration time: 30 seconds from now
    const now = new Date();
    const expirationTime = new Date(now.getTime() + 30 * 1000); // 30 seconds
    
    // Set the expiration_time field
    e.record.set("expiration_time", expirationTime.toISOString());
    
    console.log("[OTP Expiration Hook] Expiration time set to:", expirationTime.toISOString());
    console.log("[OTP Expiration Hook] Current time:", now.toISOString());
    console.log("[OTP Expiration Hook] Time difference: 30 seconds");
    
  } catch (error) {
    console.log("[OTP Expiration Hook] ERROR setting expiration time:", error.message || error);
  }
  
  // Continue execution chain
  e.next();
}, "otps");