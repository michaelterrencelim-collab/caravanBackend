const express = require("express");
const app = express.Router();

const { checkAuth } = require("../../imports/token");
const db = require("../../imports/database");

app.customPath = "/api";

/*
 * RETRIEVE ALL REVIEWS FOR A SPECIFIC PRODUCT
 *
 * GET /api/fetchReviews?productId=1
 */
app.get("/fetchReviews", async (req, res) => {
    try {
        const productId = Number(req.query.productId);

        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {
            return res.status(400).json({
                error: "A valid productId is required"
            });
        }

        const result = await db.execute({
            sql: `
                SELECT
                    r.review_id,
                    r.product_id,
                    r.Customer_id,
                    r.rating,
                    r.review_title,
                    r.review_text,
                    r.review_date,

                    c.first_name,
                    c.last_name

                FROM Review r

                INNER JOIN Customer c
                    ON r.Customer_id = c.Customer_id

                WHERE r.product_id = ?

                ORDER BY
                    r.review_date DESC,
                    r.review_id DESC
            `,
            args: [productId]
        });

        return res.status(200).json(
            result.rows
        );

    } catch (error) {
        console.error(
            "Failed to fetch reviews:",
            error
        );

        return res.status(500).json({
            error: "Failed to fetch reviews"
        });
    }
});


/*
 * FETCH AVERAGE RATING AND REVIEW COUNT
 *
 * GET /api/reviewSummary?productId=1
 */
app.get("/reviewSummary", async (req, res) => {
    try {
        const productId = Number(req.query.productId);

        if (
            !Number.isInteger(productId) ||
            productId <= 0
        ) {
            return res.status(400).json({
                error: "A valid productId is required"
            });
        }

        const result = await db.execute({
            sql: `
                SELECT
                    COALESCE(
                        ROUND(AVG(rating), 1),
                        0
                    ) AS average_rating,

                    COUNT(*) AS review_count

                FROM Review

                WHERE product_id = ?
            `,
            args: [productId]
        });

        return res.status(200).json(
            result.rows[0] || {
                average_rating: 0,
                review_count: 0
            }
        );

    } catch (error) {
        console.error(
            "Failed to fetch review summary:",
            error
        );

        return res.status(500).json({
            error: "Failed to fetch review summary"
        });
    }
});


/*
 * FETCH THE LOGGED-IN CUSTOMER'S REVIEW
 * FOR A SPECIFIC PRODUCT
 *
 * GET /api/myReview?productId=1
 */
app.get(
    "/myReview",
    checkAuth("user"),
    async (req, res) => {
        try {
            const customerId = Number(req.user.userId);
            const productId = Number(req.query.productId);

            if (!customerId) {
                return res.status(401).json({
                    error:
                        "Customer is not logged in"
                });
            }

            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "A valid productId is required"
                });
            }

            const result = await db.execute({
                sql: `
                    SELECT
                        review_id,
                        product_id,
                        Customer_id,
                        rating,
                        review_title,
                        review_text,
                        review_date

                    FROM Review

                    WHERE Customer_id = ?
                    AND product_id = ?

                    LIMIT 1
                `,
                args: [customerId, productId]
            });
            return res.status(200).json(result.rows[0] || null);

        } catch (error) {
            console.error(
                "Failed to fetch customer review:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch customer review"
            });
        }
    }
);


/*
 * ADD A REVIEW
 *
 * Only logged-in customers who purchased the
 * product can leave a review.
 *
 * POST /api/addReview
 *
 * Body:
 * {
 *     "productId": 1,
 *     "rating": 5,
 *     "review_title": "Excellent product",
 *     "review_text": "The product was very good."
 * }
 */
app.post(
    "/addReview",
    checkAuth("user"),
    async (req, res) => {
        try {
            const customerId = Number(req.user.userId);
            const productId = Number(req.body.productId);
            const rating = Number(req.body.rating);

            const reviewTitle =
                typeof req.body.review_title === "string"
                    ? req.body.review_title.trim()
                    : "";

            const reviewText =
                typeof req.body.review_text === "string"
                    ? req.body.review_text.trim()
                    : "";

            if (!customerId) {
                return res.status(401).json({
                    error:
                        "Customer is not logged in"
                });
            }

            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "A valid productId is required"
                });
            }

            if (
                !Number.isInteger(rating) ||
                rating < 1 ||
                rating > 5
            ) {
                return res.status(400).json({
                    error:
                        "Rating must be an integer between 1 and 5"
                });
            }

            if (!reviewTitle) {
                return res.status(400).json({
                    error:
                        "Review title is required"
                });
            }

            if (!reviewText) {
                return res.status(400).json({
                    error:
                        "Review text is required"
                });
            }

            if (reviewTitle.length > 150) {
                return res.status(400).json({
                    error:
                        "Review title cannot exceed 150 characters"
                });
            }

            if (reviewText.length > 2000) {
                return res.status(400).json({
                    error:
                        "Review text cannot exceed 2000 characters"
                });
            }

            /*
             * Ensure the product exists.
             */
            const productResult =
                await db.execute({
                    sql: `
                        SELECT product_id
                        FROM Product
                        WHERE product_id = ?
                    `,
                    args: [productId]
                });

            if (!productResult.rows.length) {
                return res.status(404).json({
                    error: "Product not found"
                });
            }

            /*
             * Ensure the customer previously
             * purchased the product.
             */
            const verifyPurchaseResult =
                await db.execute({
                    sql: `
                        SELECT 1

                        FROM Orders o

                        INNER JOIN Order_items oi
                            ON oi.Order_id =
                               o.Order_id

                        WHERE o.Customer_id = ?
                        AND oi.Product_id = ?

                        LIMIT 1
                    `,
                    args: [customerId, productId]
                });

            if (
                !verifyPurchaseResult.rows.length
            ) {
                return res.status(403).json({
                    error:
                        "You cannot review a product you have not purchased"
                });
            }

            /*
             * Application-level duplicate check.
             * The unique index provides another
             * database-level safeguard.
             */
            const existingReview =
                await db.execute({
                    sql: `
                        SELECT review_id

                        FROM Review

                        WHERE product_id = ?
                        AND Customer_id = ?

                        LIMIT 1
                    `,
                    args: [productId, customerId]
                });

            if (existingReview.rows.length) {
                return res.status(409).json({
                    error:
                        "You have already reviewed this product"
                });
            }

            const result = await db.execute({
                sql: `
                    INSERT INTO Review (
                        product_id,
                        Customer_id,
                        rating,
                        review_title,
                        review_text,
                        review_date
                    )
                    VALUES (
                        ?, ?, ?, ?, ?,
                        CURRENT_DATE
                    )
                `,
                args: [productId, customerId, rating, reviewTitle, reviewText]
            });

            return res.status(201).json({
                message:
                    "Review added successfully",

                review: {
                    reviewId:
                        Number(
                            result.lastInsertRowid
                        ),

                    productId,
                    customerId,
                    rating,
                    reviewTitle,
                    reviewText
                }
            });

        } catch (error) {
            console.error(
                "Failed to add review:",
                error
            );

            /*
             * Handles the unique index:
             *
             * Review(Customer_id, product_id)
             */
            if (
                error &&
                String(error.message).includes(
                    "UNIQUE constraint failed"
                )
            ) {
                return res.status(409).json({
                    error:
                        "You have already reviewed this product"
                });
            }

            return res.status(500).json({
                error: "Failed to add review"
            });
        }
    }
);


/*
 * UPDATE THE LOGGED-IN CUSTOMER'S REVIEW
 *
 * PUT /api/updateReview
 *
 * Body:
 * {
 *     "reviewId": 1,
 *     "rating": 4,
 *     "review_title": "Updated title",
 *     "review_text": "Updated review."
 * }
 */
app.put(
    "/updateReview",
    checkAuth("user"),
    async (req, res) => {
        try {
            const customerId = Number(req.user.userId);
            const reviewId = Number(req.body.reviewId);
            const rating = Number(req.body.rating);
            const reviewTitle =
                typeof req.body.review_title === "string"
                    ? req.body.review_title.trim()
                    : "";

            const reviewText =
                typeof req.body.review_text === "string"
                    ? req.body.review_text.trim()
                    : "";

            if (!customerId) {
                return res.status(401).json({
                    error:
                        "Customer is not logged in"
                });
            }

            if (
                !Number.isInteger(reviewId) ||
                reviewId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "A valid reviewId is required"
                });
            }

            if (
                !Number.isInteger(rating) ||
                rating < 1 ||
                rating > 5
            ) {
                return res.status(400).json({
                    error:
                        "Rating must be an integer between 1 and 5"
                });
            }

            if (!reviewTitle) {
                return res.status(400).json({
                    error:
                        "Review title is required"
                });
            }

            if (!reviewText) {
                return res.status(400).json({
                    error:
                        "Review text is required"
                });
            }

            if (reviewTitle.length > 150) {
                return res.status(400).json({
                    error:
                        "Review title cannot exceed 150 characters"
                });
            }

            if (reviewText.length > 2000) {
                return res.status(400).json({
                    error:
                        "Review text cannot exceed 2000 characters"
                });
            }

            const result = await db.execute({
                sql: `
                    UPDATE Review

                    SET
                        rating = ?,
                        review_title = ?,
                        review_text = ?

                    WHERE review_id = ?
                    AND Customer_id = ?
                `,
                args: [rating, reviewTitle, reviewText, reviewId, customerId]
            });

            if (!result.rowsAffected) {
                return res.status(404).json({
                    error:
                        "Review not found or you do not own this review"
                });
            }

            return res.status(200).json({
                message:"Review updated successfully",

                review: {reviewId, rating, reviewTitle, reviewText}
            });

        } catch (error) {
            console.error(
                "Failed to update review:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to update review"
            });
        }
    }
);


/*
 * DELETE THE LOGGED-IN CUSTOMER'S REVIEW
 *
 * DELETE /api/deleteReview
 *
 * Body:
 * {
 *     "reviewId": 1
 * }
 */
app.delete(
    "/deleteReview",
    checkAuth("user"),
    async (req, res) => {
        try {
            const customerId =
                Number(req.user.userId);

            const reviewId =
                Number(req.body.reviewId);

            if (!customerId) {
                return res.status(401).json({
                    error:
                        "Customer is not logged in"
                });
            }

            if (
                !Number.isInteger(reviewId) ||
                reviewId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "A valid reviewId is required"
                });
            }

            const result = await db.execute({
                sql: `
                    DELETE FROM Review

                    WHERE review_id = ?
                    AND Customer_id = ?
                `,
                args: [
                    reviewId,
                    customerId
                ]
            });

            if (!result.rowsAffected) {
                return res.status(404).json({
                    error:
                        "Review not found or you do not own this review"
                });
            }

            return res.status(200).json({
                message:
                    "Review deleted successfully"
            });

        } catch (error) {
            console.error(
                "Failed to delete review:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to delete review"
            });
        }
    }
);

module.exports = app;