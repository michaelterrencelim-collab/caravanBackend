const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");

router.customPath = "/orders";

// GET /orders
router.get("/", checkAuth("user"), async (req, res) => {

    try {
        const customerId = req.user.userId;
        const result = await db.execute({
            sql: `
            SELECT
                o.Order_id,
                o.Order_date,
                o.Total_cost,
                o.Shipping_fee,
                o.Discount,

                os.Order_status

            FROM Orders o

            INNER JOIN Order_status os
                ON o.Status_id = os.Status_id

            WHERE o.Customer_id = ?

            ORDER BY o.Order_date DESC
            `,
            args: [customerId]
        });
        return res.json(result.rows);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Unable to load orders"
        });
    }
});

// GET /orders/:orderId
router.get("/:orderId", checkAuth("user"), async (req, res) => {

    try {

        const customerId = req.user.userId;
        const orderId = Number(req.params.orderId);

        const result = await db.execute({
            sql: `
                SELECT
                    o.Order_id,
                    o.Order_date,
                    o.Total_cost,
                    o.Shipping_fee,
                    o.Discount,

                    a.Street_address,
                    a.City,
                    a.Zip_code,

                    os.Order_status,

                    oi.Quantity,
                    oi.Unit_price,
                    oi.Product_size,

                    p.Prod_name,
                    p.Prod_img

                FROM Orders o

                INNER JOIN Address a
                    ON o.Address_id = a.Address_id

                INNER JOIN Order_status os
                    ON o.Status_id = os.Status_id

                INNER JOIN Order_items oi
                    ON o.Order_id = oi.Order_id

                INNER JOIN Product p
                    ON oi.Product_id = p.Product_id

                WHERE o.Order_id = ?
                AND o.Customer_id = ?
            `,
            args: [
                orderId,
                customerId
            ]
        });

        return res.json(result.rows);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Unable to retrieve order"
        });
    }
});

module.exports = router;