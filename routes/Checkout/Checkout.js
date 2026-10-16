const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");
const { sendOrderConfirmation } = require("../../imports/email");
const { captureOrder } = require("../paypal/paypal");

router.customPath = "/checkout";

/* 
*  NOTE: TEST_MODE allows dev to dry test Checkout Function without posting changes to db
*  set TEST_MODE to false to exit test mode 
*/
const TEST_MODE = false;

router.post("/", checkAuth("user"), async (req, res) => {
    let transaction = null;

    try {
        const customerId = Number(req.user.userId);

        const {
            items,
            addressId,
            methodId,
            paymentType,
            paypalOrderId,
            shippingId,
            voucherId
        } = req.body;

        if (!customerId) {
            return res.status(401).json({
                success: false,
                error: "User ID not found"
            });
        }

        const customerResult = await db.execute({
            sql: `
                SELECT
                    Cus_email,
                    first_name
                FROM Customer
                WHERE Customer_id = ?
            `,
            args: [customerId]
        });

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Customer account was not found"
            });
        }

        const customerEmail = customerResult.rows[0].Cus_email;
        const customerName = customerResult.rows[0].first_name;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Your cart is empty"
            });
        }

        if (!addressId) {
            return res.status(400).json({
                success: false,
                error: "Delivery address is required"
            });
        }

        if (!shippingId) {
            return res.status(400).json({
                success: false,
                error: "Shipping option is required"
            });
        }

        const normalizedPaymentType = String(paymentType || "cash").toLowerCase();
        let resolvedMethodId;
        if (normalizedPaymentType === "paypal") {
            const paypalMethod = await db.execute({
                sql: `
                    SELECT Method_id
                    FROM Payment_method
                    WHERE LOWER(Payment_method) = 'paypal'
                    LIMIT 1
                `
            });
            if (paypalMethod.rows.length === 0) {
                return res.status(409).json({
                    success: false,
                    error: "PayPal is not configured as a payment method. Add PayPal to the Payment_method table."
                });
            }
            resolvedMethodId = Number(paypalMethod.rows[0].Method_id);
            if (!paypalOrderId) {
                return res.status(400).json({ success: false, error: "PayPal approval is required" });
            }
        } else if (normalizedPaymentType === "cash" && Number(methodId) === 2) {
            resolvedMethodId = 2;
        } else if (normalizedPaymentType === "card" || Number(methodId) === 1) {
            return res.status(501).json({
                success: false,
                error: "Card payment is not available yet"
            });
        } else {
            return res.status(400).json({
                success: false,
                error: "Invalid payment method"
            });
        }

        transaction = await db.transaction("write");

        // Ensure the address belongs to the user.
        const addressResult = await transaction.execute({
            sql: `
                SELECT Address_id
                FROM Address
                WHERE Address_id = ?
                AND Customer_id = ?
            `,
            args: [
                Number(addressId),
                customerId
            ]
        });

        if (addressResult.rows.length === 0) {
            throw new Error(
                "The selected delivery address is invalid"
            );
        }

        const preparedItems = [];
        const requiredStock = new Map();

        let productCost = 0;

        for (const item of items) {
            const productId = Number(item.productId);
            const quantity = Number(item.quantity);

            const productSize =
                Number.parseInt(item.productSize, 10) === 16
                    ? 16
                    : 8;

            if (
                !Number.isInteger(productId) ||
                productId <= 0 ||
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                throw new Error(
                    "One or more cart items are invalid"
                );
            }

            const productResult =
                await transaction.execute({
                    sql: `
                        SELECT
                            product_id,
                            Prod_name,
                            Prod_price,
                            Prod_amount
                        FROM Product
                        WHERE product_id = ?
                    `,
                    args: [productId]
                });

            if (productResult.rows.length === 0) {
                throw new Error(
                    `Product ${productId} was not found`
                );
            }

            const product = productResult.rows[0];
            const availableStock = Number(product.Prod_amount);
            const previousRequired = requiredStock.get(productId) || 0;
            const totalRequired = previousRequired + quantity;

            requiredStock.set(
                productId,
                totalRequired
            );

            if (availableStock < totalRequired) {
                throw new Error(
                    `Not enough stock for ${product.Prod_name}`
                );
            }
            const basePrice = Number(product.Prod_price);

            /*
             * This maintains your current pricing:
             * Prod_price × 8 oz or 16 oz.
             */
            const unitPrice = basePrice * productSize;
            productCost += unitPrice * quantity;
            preparedItems.push({
                productId,
                productName: product.Prod_name,
                quantity,
                productSize,
                unitPrice
            });
        }

        let validatedVoucherId = null;
        let discount = 0;

        if (voucherId) {
            const voucherResult =
                await transaction.execute({
                    sql: `
                        SELECT
                            v.Voucher_id,
                            v.discount
                        FROM Customer_vouchers cv
                        INNER JOIN Vouchers v
                            ON cv.Voucher_id = v.Voucher_id
                        WHERE cv.Customer_id = ?
                        AND cv.Voucher_id = ?
                        AND cv.Voucher_status = 'Unused'
                    `,
                    args: [
                        customerId,
                        Number(voucherId)
                    ]
                });

            if (voucherResult.rows.length === 0) {
                throw new Error(
                    "The selected voucher is unavailable"
                );
            }

            validatedVoucherId = Number(voucherResult.rows[0].Voucher_id);
            const discountPercentage = Number(voucherResult.rows[0].discount) || 0;
            discount = productCost * (discountPercentage / 100);
        }

        const shippingResult =
            await transaction.execute({
                sql: `
                    SELECT
                        Shipping_id,
                        Shipping_name,
                        Cost
                    FROM Shipping_options
                    WHERE Shipping_id = ?
                    AND Status_id = 1
                `,
                args: [
                    Number(shippingId)
                ]
            });

        if (shippingResult.rows.length === 0) {
            throw new Error(
                "Invalid shipping option selected"
            );
        }

        const validatedShippingId = Number(shippingResult.rows[0].Shipping_id);
        const shippingName = shippingResult.rows[0].Shipping_name;
        const shippingFee = Number(shippingResult.rows[0].Cost);
        const totalCost = productCost + shippingFee - discount;

        // TEST_MODE LOGIC 
        if (TEST_MODE) {
            const preview = {
                customerId,
                addressId: Number(addressId),
                methodId: resolvedMethodId,
                voucherId: validatedVoucherId,

                pricing: {
                    productCost: Number(productCost.toFixed(2)),
                    discount: Number(discount.toFixed(2)),
                    shippingFee,
                    totalCost: Number(totalCost.toFixed(2))
                },

                items: preparedItems,

                stockAdjustments: Array.from(
                    requiredStock.entries()
                ).map(([productId, quantityBought]) => ({
                    productId,
                    quantityBought
                }))
            };

            console.log("CHECKOUT PREVIEW:", JSON.stringify(preview, null, 4));

            await transaction.rollback();
            transaction = null;

            return res.status(200).json({
                success: true,
                testMode: true,
                message: "Checkout validation passed. No database changes were saved.",
                preview
            });
        }

        // PayPal is captured only after server-side cart, stock, address,
        // voucher, and shipping validation has produced the final amount.
        if (normalizedPaymentType === "paypal") {
            try {
                await captureOrder(
                    paypalOrderId,
                    customerId,
                    Number(totalCost.toFixed(2))
                );
            } catch (paymentError) {
                console.error("PayPal capture error:", paymentError.response?.data || paymentError.message);
                const checkoutError = new Error(paymentError.message || "PayPal payment could not be captured");
                checkoutError.statusCode = paymentError.statusCode || 402;
                throw checkoutError;
            }
        }

        // Create order with Confirmed status.
        const orderResult =
            await transaction.execute({
                sql: `
                    INSERT INTO Orders (
                        Customer_id,
                        Status_id,
                        Total_cost,
                        Shipping_fee,
                        Address_id,
                        Order_date,
                        Method_id,
                        Voucher_id,
                        Discount,
                        Shipping_id
                    )
                    VALUES (
                        ?, 1, ?, ?, ?,
                        CURRENT_TIMESTAMP, ?, ?, ?, ?
                    )
                `,
                args: [
                    customerId,
                    Number(totalCost.toFixed(2)),
                    shippingFee,
                    Number(addressId),
                    resolvedMethodId,
                    validatedVoucherId,
                    Number(discount.toFixed(2)), 
                    validatedShippingId
                ]
            });

        const orderId = Number(orderResult.lastInsertRowid);

        // Insert order items.
        for (const item of preparedItems) {
            await transaction.execute({
                sql: `
                    INSERT INTO Order_items (
                        Order_id,
                        Product_id,
                        Quantity,
                        Unit_price,
                        Product_Size
                    )
                    VALUES (?, ?, ?, ?, ?)
                `,
                args: [
                    orderId,
                    item.productId,
                    item.quantity,
                    Number(item.unitPrice.toFixed(2)),
                    item.productSize
                ]
            });
        }

        // Decrease stock based on total quantity purchased.
        for (
            const [productId, quantityBought]
            of requiredStock.entries()
        ) {
            const stockResult =
                await transaction.execute({
                    sql: `
                        UPDATE Product
                        SET Prod_amount =
                            Prod_amount - ?
                        WHERE product_id = ?
                        AND Prod_amount >= ?
                    `,
                    args: [
                        quantityBought,
                        productId,
                        quantityBought
                    ]
                });

            if (!stockResult.rowsAffected) {
                throw new Error(
                    `Unable to update stock for product ${productId}`
                );
            }
        }

        // Mark selected voucher as Used.
        if (validatedVoucherId) {
            const voucherUpdate =
                await transaction.execute({
                    sql: `
                        UPDATE Customer_vouchers
                        SET Voucher_status = 'Used'
                        WHERE Customer_id = ?
                        AND Voucher_id = ?
                        AND Voucher_status = 'Unused'
                    `,
                    args: [
                        customerId,
                        validatedVoucherId
                    ]
                });

            if (!voucherUpdate.rowsAffected) {
                throw new Error(
                    "Unable to mark the voucher as used"
                );
            }
        }

        await transaction.commit();
        transaction = null;

        let confirmationEmailSent = false;

        try {
            await sendOrderConfirmation({
                customerEmail,
                customerName,
                orderId,
                items: preparedItems,
                productCost: Number(productCost.toFixed(2)),
                discount: Number(discount.toFixed(2)),
                shippingName,
                shippingFee: Number(shippingFee.toFixed(2)),
                totalCost: Number(totalCost.toFixed(2)),
                paymentMethod: normalizedPaymentType === "paypal"
                    ? "Online Payment (PayPal)"
                    : "Cash on Delivery"
            });

            confirmationEmailSent = true;

        } catch (emailError) {
            console.error(
                "Order saved, but confirmation email failed:",
                emailError
            );
        }

        return res.status(201).json({
            success: true,
            message: confirmationEmailSent
                ? "Order placed successfully. A confirmation email was sent."
                : "Order placed successfully, but the confirmation email could not be sent.",

            orderId,
            customerEmail,
            paymentType: normalizedPaymentType,
            emailSent: confirmationEmailSent,
            shippingId: validatedShippingId,
            shippingFee: Number(shippingFee.toFixed(2)),
            productCost: Number(productCost.toFixed(2)),
            discount: Number(discount.toFixed(2)),
            totalCost: Number(totalCost.toFixed(2))
        });
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Checkout rollback error:", rollbackError);
            }
        }

        console.error("Checkout error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            error: 
                error.message || "Checkout failed"
        });
    }
});

module.exports = router;
