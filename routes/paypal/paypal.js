const express = require("express");
const router = express.Router();
const axios = require("axios");
const { checkAuth } = require("../../imports/token");
const db = require("../../imports/database");

router.customPath = "/paypal";

async function generateAccessToken() {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_API) {
        throw new Error("PayPal is not configured on the server");
    }

    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");
    const response = await axios.post(
        `${process.env.PAYPAL_API.replace(/\/$/, "")}/v1/oauth2/token`,
        "grant_type=client_credentials",
        {
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );
    return response.data.access_token;
}

router.get("/config", async (req, res) => {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_API) {
        return res.status(503).json({ error: "PayPal is not configured" });
    }
    try {
        const method = await db.execute({
            sql: "SELECT Method_id FROM Payment_method WHERE LOWER(Payment_method) = 'paypal' LIMIT 1"
        });
        if (method.rows.length === 0) {
            return res.status(409).json({ error: "Add PayPal to the Payment_method table before accepting PayPal orders" });
        }
    } catch (error) {
        console.error("PayPal configuration lookup failed:", error.message);
        return res.status(503).json({ error: "Unable to verify PayPal payment configuration" });
    }
    return res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

router.post("/create-order", checkAuth("user"), async (req, res) => {
    try {
        const method = await db.execute({
            sql: "SELECT Method_id FROM Payment_method WHERE LOWER(Payment_method) = 'paypal' LIMIT 1"
        });
        if (method.rows.length === 0) {
            return res.status(409).json({ error: "PayPal is not configured as a payment method" });
        }

        const amount = Number(req.body.totalCost);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: "A valid checkout total is required" });
        }
        const addressId = Number(req.body.addressId);
        if (!Number.isInteger(addressId) || addressId <= 0) {
            return res.status(400).json({ error: "Select a valid delivery address" });
        }

        const addressResult = await db.execute({
            sql: `
                SELECT
                    a.Street_address,
                    a.City,
                    a.Zip_code,
                    c.first_name,
                    c.last_name
                FROM Address a
                INNER JOIN Customer c ON c.Customer_id = a.Customer_id
                WHERE a.Address_id = ?
                AND a.Customer_id = ?
            `,
            args: [addressId, Number(req.user.userId)]
        });
        if (addressResult.rows.length === 0) {
            return res.status(400).json({ error: "The selected delivery address is invalid" });
        }

        const selectedAddress = addressResult.rows[0];
        const addressLine = String(selectedAddress.Street_address || "").trim();
        const city = String(selectedAddress.City || "").trim();
        const postalCode = String(selectedAddress.Zip_code || "").trim();
        const customerName = `${selectedAddress.first_name || ""} ${selectedAddress.last_name || ""}`.trim();
        if (!addressLine || !city || !postalCode || !customerName) {
            return res.status(400).json({ error: "Complete your delivery address and customer name before paying" });
        }

        const accessToken = await generateAccessToken();
        const response = await axios.post(
            `${process.env.PAYPAL_API.replace(/\/$/, "")}/v2/checkout/orders`,
            {
                intent: "CAPTURE",
                purchase_units: [{
                    custom_id: String(req.user.userId),
                    shipping: {
                        name: { full_name: customerName },
                        address: {
                            address_line_1: addressLine,
                            admin_area_2: city,
                            postal_code: postalCode,
                            country_code: "PH"
                        }
                    },                    
                    amount: {
                        currency_code: "PHP",
                        value: amount.toFixed(2)
                    }
                }],
                payment_source: {
                    paypal: {
                        experience_context: {
                            landing_page: "LOGIN",
                            shipping_preference: "SET_PROVIDED_ADDRESS"
                        }
                    }
                }                
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return res.json({ id: response.data.id });
    } catch (error) {
        console.error("PayPal create order error:", error.response?.data || error.message);
        return res.status(502).json({ error: "Unable to create PayPal order" });
    }
});

async function captureOrder(orderId, customerId, expectedTotal) {
    if (typeof orderId !== "string" || !/^[A-Z0-9-]{10,}$/i.test(orderId)) {
        throw new Error("A valid PayPal order is required");
    }

    const accessToken = await generateAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };
    const orderResponse = await axios.get(
        `${process.env.PAYPAL_API.replace(/\/$/, "")}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        { headers }
    );
    const approvedOrder = orderResponse.data;
    const approvedUnit = approvedOrder.purchase_units?.[0];
    const approvedAmount = Number(approvedUnit?.amount?.value);
    if (
        approvedOrder.status !== "APPROVED" ||
        String(approvedUnit?.custom_id) !== String(customerId) ||
        approvedUnit?.amount?.currency_code !== "PHP" ||
        !Number.isFinite(approvedAmount) ||
        approvedAmount !== Number(Number(expectedTotal).toFixed(2))
    ) {
        throw new Error("PayPal approval does not match this checkout");
    }

    const response = await axios.post(
        `${process.env.PAYPAL_API.replace(/\/$/, "")}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {},
        { headers }
    );

    const order = response.data;
    const purchaseUnit = order.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const capturedAmount = Number(capture?.amount?.value);
    if (
        order.status !== "COMPLETED" ||
        capture?.status !== "COMPLETED" ||
        capture?.amount?.currency_code !== "PHP" ||
        !Number.isFinite(capturedAmount) ||
        capturedAmount !== Number(Number(expectedTotal).toFixed(2))
    ) {
        console.error("PayPal capture verification mismatch:", {
            orderStatus: order.status,
            captureStatus: capture?.status,
            currency: capture?.amount?.currency_code,
            capturedAmount,
            expectedAmount: Number(Number(expectedTotal).toFixed(2))
        });
        throw new Error("PayPal payment could not be verified against this order");
    }

    return { orderId: order.id, captureId: capture.id, amount: capturedAmount };
}

module.exports = router;
module.exports.captureOrder = captureOrder;
