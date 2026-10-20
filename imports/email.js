const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    },

    tls: {
        rejectUnauthorized: false
    }
});

async function sendOrderConfirmation({
    customerEmail,
    customerName,
    orderId,
    items,
    productCost,
    discount,
    shippingName,
    shippingFee,
    totalCost,
    paymentMethod
}) {
    const itemRows = items.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #dddddd;">
                ${escapeHTML(item.productName)}
            </td>

            <td style="padding: 8px; border-bottom: 1px solid #dddddd;">
                ${item.productSize} oz
            </td>

            <td style="padding: 8px; border-bottom: 1px solid #dddddd;">
                ${item.quantity}
            </td>

            <td style="padding: 8px; border-bottom: 1px solid #dddddd;">
                ₱${Number(item.unitPrice).toFixed(2)}
            </td>

            <td style="padding: 8px; border-bottom: 1px solid #dddddd;">
                ₱${Number(
                    item.unitPrice * item.quantity
                ).toFixed(2)}
            </td>
        </tr>
    `).join("");

    await transporter.sendMail({
        from: `"Caravan" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `Caravan Order Confirmation #${orderId}`,

        html: `
            <div style="
                max-width: 650px;
                margin: 0 auto;
                padding: 24px;
                font-family: Arial, sans-serif;
                color: #333333;
            ">
                <h2 style="color: #6F4E37;">
                    Order Confirmed
                </h2>

                <p>
                    Hello ${escapeHTML(customerName || "Customer")},
                </p>

                <p>
                    Your order has been placed successfully.
                </p>

                <p>
                    <strong>Order number:</strong>
                    #${orderId}
                </p>

                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                ">
                    <thead>
                        <tr style="background: #F4EDE5;">
                            <th style="padding: 8px; text-align: left;">
                                Product
                            </th>

                            <th style="padding: 8px; text-align: left;">
                                Size
                            </th>

                            <th style="padding: 8px; text-align: left;">
                                Quantity
                            </th>

                            <th style="padding: 8px; text-align: left;">
                                Unit Price
                            </th>

                            <th style="padding: 8px; text-align: left;">
                                Subtotal
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        ${itemRows}
                    </tbody>
                </table>

                <div style="
                    margin-top: 24px;
                    text-align: right;
                    line-height: 1.8;
                ">
                    <div>
                        Products:
                        ₱${Number(productCost).toFixed(2)}
                    </div>

                    <div>
                        Shipping (${escapeHTML(shippingName)}):
                        ₱${Number(shippingFee).toFixed(2)}
                    </div>

                    <div>
                        Discount:
                        -₱${Number(discount).toFixed(2)}
                    </div>

                    <div>
                        Payment method:
                        ${escapeHTML(paymentMethod || "Cash on Delivery")}
                    </div>

                    <div style="
                        font-size: 18px;
                        font-weight: bold;
                        color: #6F4E37;
                    ">
                        Total:
                        ₱${Number(totalCost).toFixed(2)}
                    </div>
                </div>

                <p style="
                    margin-top: 30px;
                    color: #777777;
                    font-size: 13px;
                ">
                    Thank you for shopping with Caravan.
                </p>
            </div>
        `
    });
}

async function sendAdminInvitation({ customerEmail, customerName, inviterName, invitationUrl, expiresAt }) {
    const expiryText = new Date(expiresAt).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila"
    });
    await transporter.sendMail({
        from: `"Caravan Admin" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: "Caravan admin access invitation",
        text: `Hello ${customerName}, ${inviterName} invited you to become a Caravan admin. Review the invitation and accept or decline it here: ${invitationUrl}. This invitation expires ${expiryText}.`,
        html: `
            <div style="max-width:600px;margin:0 auto;padding:28px;font-family:Arial,sans-serif;color:#29231c;background:#f8f4ed;">
                <h2 style="color:#9b6d19;margin-top:0;">Caravan admin invitation</h2>
                <p>Hello ${escapeHTML(customerName || "Customer")},</p>
                <p>${escapeHTML(inviterName || "A Caravan administrator")} invited you to join the Caravan admin team.</p>
                <p>Review the invitation to accept or decline. Accepting will let you sign in to Caravan Admin Management with your existing Caravan account credentials.</p>
                <p style="margin:26px 0;"><a href="${escapeHTML(invitationUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#d9a441;color:#1c1712;text-decoration:none;font-weight:bold;">Review invitation</a></p>
                <p style="color:#71675a;font-size:13px;">This invitation expires ${escapeHTML(expiryText)}. If you did not expect this invitation, you can ignore this email.</p>
            </div>
        `
    });
}

function escapeHTML(value) {
    return String(value || "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

transporter.verify(function(error, success) {
    if (error) {
        console.error("SMTP Verify Error:", error);
    } else {
        console.log("SMTP Server Ready");
    }
});

module.exports = {
    sendOrderConfirmation,
    sendAdminInvitation
};
