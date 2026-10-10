const express = require("express");
const router = express.Router();
const db = require("../../imports/database");

router.customPath = "/shipping";

router.get("/", async (req, res) => {
    try {

        const result = await db.execute({
            sql: `
                SELECT
                    Shipping_id,
                    Shipping_name,
                    Shipping_text,
                    Cost
                FROM Shipping_options
                WHERE Status_id = 1
                ORDER BY Shipping_id
            `
        });

        return res.json(result.rows);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Unable to load shipping options"
        });
    }
});

module.exports = router;