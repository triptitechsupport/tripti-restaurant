/// <reference path="../pb_data/types.d.ts" />
onRecordAfterCreateSuccess((e) => {
  // Log hook execution start
  console.log("[OTP Hook] Hook triggered for OTP record creation");
  
  try {
    // Extract email and OTP code from the record
    const email = e.record.get("email");
    const otpCode = e.record.get("otp_code");
    const expirationTime = e.record.get("expiration_time");
    
    // Validate required fields
    if (!email || !otpCode) {
      console.log("[OTP Hook] ERROR: Missing email or OTP code. Email:", email, "OTP Code:", otpCode);
      e.next();
      return;
    }
    
    console.log("[OTP Hook] Processing OTP for email:", email);
    console.log("[OTP Hook] OTP Code:", otpCode);
    console.log("[OTP Hook] Expiration Time:", expirationTime);
    
    // Get sender settings from PocketBase configuration
    const senderAddress = $app.settings().meta.senderAddress;
    const senderName = $app.settings().meta.senderName;
    
    console.log("[OTP Hook] Sender Address:", senderAddress, "Sender Name:", senderName);
    
    // Create email message with OTP code
    const message = new MailerMessage({
      from: {
        address: senderAddress,
        name: senderName || "Restaurant System"
      },
      to: [{ address: email }],
      subject: "Your One-Time Password (OTP)",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333; margin-top: 0;">Your One-Time Password</h2>
            
            <p style="color: #666; font-size: 16px;">
              Your OTP code is:
            </p>
            
            <div style="background-color: #fff; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 48px; font-weight: bold; color: #007bff; letter-spacing: 8px;">
                ${otpCode}
              </span>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>⏱️ This code expires in 30 seconds.</strong>
            </p>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              If you did not request this code, please ignore this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    });
    
    console.log("[OTP Hook] Email message created successfully");
    
    // Send the email
    $app.newMailClient().send(message);
    
    console.log("[OTP Hook] Email sent successfully to:", email);
    console.log("[OTP Hook] OTP Code:", otpCode, "| Expiration:", expirationTime);
    
  } catch (error) {
    console.log("[OTP Hook] ERROR sending email:", error.message || error);
  }
  
  // Continue execution chain
  e.next();
}, "otps");