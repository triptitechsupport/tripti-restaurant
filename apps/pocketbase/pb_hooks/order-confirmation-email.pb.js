/// <reference path="../pb_data/types.d.ts" />
onRecordAfterCreateSuccess((e) => {
  try {
    const senderAddress = $app.settings().meta.senderAddress;
    const senderName = $app.settings().meta.senderName || "Restaurant";
    const customerEmail = e.record.get("customerEmail");
    const orderNumber = e.record.get("orderNumber");
    const totalPrice = e.record.get("totalPrice");
    const estimatedDeliveryTime = e.record.get("estimatedDeliveryTime");
    const items = e.record.get("items");

    // Validate required fields
    if (!customerEmail || !senderAddress) {
      console.log("Order confirmation email skipped: missing email configuration or customer email");
      e.next();
      return;
    }

    // Format items for display
    let itemsHtml = "<ul>";
    if (items && Array.isArray(items)) {
      items.forEach((item) => {
        itemsHtml += "<li>" + (item.name || "Item") + " x" + (item.quantity || 1) + " - $" + (item.price || 0).toFixed(2) + "</li>";
      });
    }
    itemsHtml += "</ul>";

    const message = new MailerMessage({
      from: {
        address: senderAddress,
        name: senderName
      },
      to: [{ address: customerEmail }],
      subject: "Order Confirmation #" + orderNumber,
      html: "<h2>Thank you for your order!</h2>" +
            "<p><strong>Order Number:</strong> " + orderNumber + "</p>" +
            "<p><strong>Total Price:</strong> $" + totalPrice.toFixed(2) + "</p>" +
            "<h3>Items:</h3>" +
            itemsHtml +
            (estimatedDeliveryTime ? "<p><strong>Estimated Delivery Time:</strong> " + estimatedDeliveryTime + "</p>" : "") +
            "<p>We will prepare your order and deliver it as soon as possible.</p>" +
            "<p>Thank you for choosing us!</p>"
    });

    $app.newMailClient().send(message);
    console.log("Order confirmation email sent successfully for order: " + orderNumber);
  } catch (error) {
    // Log the error but do NOT throw - allow order creation to proceed
    console.log("Error sending order confirmation email: " + error.message);
  }

  // CRITICAL: Always call e.next() to allow the order to be saved
  e.next();
}, "orders");