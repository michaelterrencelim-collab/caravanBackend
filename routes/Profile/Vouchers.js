const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");

router.customPath = "/vouchers";

// GET UNUSED VOUCHERS FOR CURRENT USER
router.get("/me", checkAuth("user"), async (req, res) => {
    try {
        const customerId = req.user.userId;

        if (!customerId) {
            return res.status(401).json({
                error: "User ID not found"
            });
        }

        const result = await db.execute({
            sql: `
                SELECT
                    v.Voucher_id,
                    v.Voucher_name,
                    v.Voucher_desc,
                    v.discount,
                    cv.Voucher_status
                FROM Customer_vouchers cv
                INNER JOIN Vouchers v
                    ON cv.Voucher_id = v.Voucher_id
                WHERE cv.Customer_id = ?
                AND cv.Voucher_status = 'Unused'
                ORDER BY v.Voucher_id
            `,
            args: [customerId]
        });

        return res.status(200).json(result.rows);

    } catch (error) {
        console.error("Voucher retrieval error:", error);

        return res.status(500).json({
            error: "Unable to retrieve vouchers"
        });
    }
});

// APPLY VOUCHER FOR CURRENT USER
router.post("/apply", checkAuth("user"), async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { voucherId } = req.body;

        if (!customerId) {
            return res.status(401).json({
                error: "User ID not found"
            });
        }

        if (!voucherId) {
            return res.status(400).json({
                error: "Voucher ID is required"
            });
        }

        const result = await db.execute({
            sql: `
                SELECT
                    v.Voucher_id,
                    v.Voucher_name,
                    v.Voucher_desc,
                    v.discount
                FROM Customer_vouchers cv
                INNER JOIN Vouchers v
                    ON cv.Voucher_id = v.Voucher_id
                WHERE cv.Customer_id = ?
                AND cv.Voucher_id = ?
                AND cv.Voucher_status = 'Unused'
            `,
            args: [customerId, voucherId]
        });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Voucher not available"
            });
        }

        const voucher = result.rows[0];

        return res.status(200).json({
            success: true,
            voucherId: voucher.Voucher_id,
            voucherName: voucher.Voucher_name,
            voucherDescription: voucher.Voucher_desc,
            discount: voucher.discount
        });

    } catch (error) {
        console.error("Voucher application error:", error);

        return res.status(500).json({
            error: "Unable to apply voucher"
        });
    }
});

// MARK VOUCHER AS USED FOR CURRENT USER
router.put("/use", checkAuth("user"), async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { voucherId } = req.body;

        if (!customerId) {
            return res.status(401).json({
                error: "User ID not found"
            });
        }

        if (!voucherId) {
            return res.status(400).json({
                error: "Voucher ID is required"
            });
        }

        const result = await db.execute({
            sql: `
                UPDATE Customer_vouchers
                SET Voucher_status = 'Used'
                WHERE Customer_id = ?
                AND Voucher_id = ?
                AND Voucher_status = 'Unused'
            `,
            args: [customerId, voucherId]
        });

        if (!result.rowsAffected) {
            return res.status(404).json({
                success: false,
                message: "Available voucher not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Voucher successfully used"
        });

    } catch (error) {
        console.error("Voucher update error:", error);

        return res.status(500).json({
            error: "Unable to update voucher"
        });
    }
});

module.exports = router;