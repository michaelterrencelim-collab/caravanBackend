const express = require("express");
const router = express.Router();
const db = require("../../imports/database");

const {
    checkAuth,
    requireAuth
} = require("../../imports/token");

router.customPath = "/returns";

/*
 * CLIENT
 * Create a refund request for an order.
 *
 * POST /returns
 *
 * Body:
 * {
 *     "orderId": 5,
 *     "reason": "The product arrived damaged."
 * }
 */
router.post("/", checkAuth("user"), async (req, res) => {
    try {
        const customerId = Number(req.user.userId);

        const orderId =
            Number(req.body.orderId);

        const reason =
            String(req.body.reason || "").trim();

        if (!customerId) {
            return res.status(401).json({
                success: false,
                error: "User ID not found"
            });
        }

        if (
            !Number.isInteger(orderId) ||
            orderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "A valid order ID is required"
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: "Refund reason is required"
            });
        }

        if (reason.length > 1000) {
            return res.status(400).json({
                success: false,
                error: "Refund reason is too long"
            });
        }

        /*
         * Verify that the order belongs to
         * the currently logged-in customer.
         */
        const orderResult = await db.execute({
            sql: `
                SELECT
                    Order_id,
                    Customer_id,
                    Total_cost
                FROM Orders
                WHERE Order_id = ?
                AND Customer_id = ?
            `,
            args: [
                orderId,
                customerId
            ]
        });

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Order not found"
            });
        }

        /*
         * Prevent more than one active refund
         * request for the same order.
         */
        const existingReturn = await db.execute({
            sql: `
                SELECT
                    Return_id,
                    Return_status
                FROM Returns
                WHERE Order_id = ?
                AND Return_status IN (
                    'Pending',
                    'Approved'
                )
            `,
            args: [orderId]
        });

        if (existingReturn.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error:
                    "A refund request already exists for this order"
            });
        }

        const order =
            orderResult.rows[0];

        /*
         * Do not accept the refund amount
         * from the browser. Use the saved
         * order total instead.
         */
        const refundAmount =
            Number(order.Total_cost);

        const result = await db.execute({
            sql: `
                INSERT INTO Returns (
                    Order_id,
                    Reason,
                    Return_status,
                    Refund_amount,
                    Request_date
                )
                VALUES (
                    ?,
                    ?,
                    'Pending',
                    ?,
                    CURRENT_TIMESTAMP
                )
            `,
            args: [
                orderId,
                reason,
                refundAmount
            ]
        });

        const returnId =
            Number(result.lastInsertRowid);

        return res.status(201).json({
            success: true,
            message:
                "Refund request submitted successfully",
            refundRequest: {
                returnId,
                orderId,
                reason,
                returnStatus: "Pending",
                refundAmount
            }
        });

    } catch (error) {
        console.error(
            "Create refund request error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to submit refund request"
        });
    }
});

/*
 * CLIENT
 * Get refund requests belonging to
 * the logged-in customer.
 *
 * GET /returns/me
 */
router.get("/me", checkAuth("user"), async (req, res) => {
    try {
        const customerId =
            Number(req.user.userId);

        if (!customerId) {
            return res.status(401).json({
                success: false,
                error: "User ID not found"
            });
        }

        const result = await db.execute({
            sql: `
                SELECT
                    r.Return_id,
                    r.Order_id,
                    r.Reason,
                    r.Return_status,
                    r.Refund_amount,
                    r.Request_date,

                    o.Order_date,
                    o.Total_cost

                FROM Returns r

                INNER JOIN Orders o
                    ON r.Order_id = o.Order_id

                WHERE o.Customer_id = ?

                ORDER BY r.Request_date DESC
            `,
            args: [customerId]
        });

        return res.status(200).json(
            result.rows
        );

    } catch (error) {
        console.error(
            "Retrieve customer refunds error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to retrieve refund requests"
        });
    }
});

/*
 * ADMIN
 * Retrieve all client refund requests.
 *
 * GET /returns
 */
router.get("/", requireAuth("admin"), async (req, res) => {
    try {
        const result = await db.execute({
            sql: `
                SELECT
                    r.Return_id,
                    r.Order_id,
                    r.Reason,
                    r.Return_status,
                    r.Refund_amount,
                    r.Request_date,

                    o.Customer_id,
                    o.Order_date,
                    o.Total_cost,

                    c.first_name,
                    c.last_name,
                    c.Cus_email

                FROM Returns r

                INNER JOIN Orders o
                    ON r.Order_id = o.Order_id

                INNER JOIN Customer c
                    ON o.Customer_id = c.Customer_id

                ORDER BY
                    CASE r.Return_status
                        WHEN 'Pending' THEN 1
                        WHEN 'Approved' THEN 2
                        WHEN 'Rejected' THEN 3
                        WHEN 'Refunded' THEN 4
                        ELSE 5
                    END,
                    r.Request_date DESC
            `
        });

        return res.status(200).json(
            result.rows
        );

    } catch (error) {
        console.error(
            "Admin refund retrieval error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to retrieve refund requests"
        });
    }
});

/*
 * ADMIN
 * Update refund request status.
 *
 * PUT /returns/:returnId/status
 *
 * Body:
 * {
 *     "status": "Approved"
 * }
 */
router.put(
    "/:returnId/status",
    requireAuth("admin"),
    async (req, res) => {
        try {
            const returnId =
                Number(req.params.returnId);

            const status =
                String(req.body.status || "").trim();

            const allowedStatuses = [
                "Pending",
                "Approved",
                "Rejected",
                "Refunded"
            ];

            if (
                !Number.isInteger(returnId) ||
                returnId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "A valid return ID is required"
                });
            }

            if (
                !allowedStatuses.includes(status)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid refund status"
                });
            }

            const result = await db.execute({
                sql: `
                    UPDATE Returns
                    SET Return_status = ?
                    WHERE Return_id = ?
                `,
                args: [
                    status,
                    returnId
                ]
            });

            if (!result.rowsAffected) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Refund request not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Refund status updated successfully",
                returnId,
                status
            });

        } catch (error) {
            console.error(
                "Refund status update error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to update refund status"
            });
        }
    }
);

module.exports = router;