const express = require("express");
const app = express.Router();
const { checkAuth } = require("../../imports/token");
const db = require("../../imports/database");

app.customPath = "/api";


/* RETRIEVE ALL REVIEWS FOR A SPECIFIC PRODUCT */ 
app.get("/fetchReviews", async (req, res) => {
  const productId = Number(req.query.productId);
  try {
    const result = await db.execute({
      sql: `
      SELECT
          r.review_id,
          r.rating,
          r.review_text,

          c.first_name,
          c.last_name

      FROM Review r

      INNER JOIN Customer c
          ON r.Customer_id =
            c.Customer_id

      WHERE r.product_id = ?

      ORDER BY r.review_id DESC
      `,
      args: [productId],
    });

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Failed to fetch reviews:", error);

    return res.status(500).json({
      error: "Failed to fetch reviews",
    });
  }
});

/* Fetch the average rating and review count for a specific product */
app.get("/reviewSummary", async (req, res) => {
    try {

        const productId = Number(req.query.productId);
        const result =
            await db.execute({
                sql: `
                    SELECT
                        ROUND(
                            AVG(rating),
                            1
                        ) AS average_rating,
                        COUNT(*) AS review_count
                    FROM Review
                    WHERE product_id = ?
                `,
                args: [productId]
            });
        return res.json(result.rows[0]);
    }

    catch(error) {
        console.error("Failed to fetch review summary: ",error);
        return res.status(500).json({error: "Failed to fetch review summary"});
    }
});

/* ADD A PRODUCT OR BUNDLE TO THE LOGGED-IN CUSTOMER'S REVIEWS */
app.post("/addReview", checkAuth("user"), async (req, res) => {
  try {
    const customerId = Number(req.user.userId);
    const productId = Number(req.body.productId);
    const rating = Number(req.body.rating);
    const reviewText = req.body.review_text;

    if (!customerId) {
      return res.status(401).json({
        error: "Customer is not logged in",
      });
    }

    if (!productId) {
      return res.status(400).json({
        error: "A valid productId is required",
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating must be an integer between 1 and 5",
      });
    }

    if (!reviewText || typeof reviewText !== "string") {
      return res.status(400).json({
        error: "Review text is required",
      });
    }

    const verifyPurchaseResult = await db.execute({
      sql: `
        SELECT 1
        FROM Orders o

        INNER JOIN Order_items oi
            ON oi.Order_id = o.Order_id

        WHERE o.Customer_id = ?
        AND oi.Product_id = ?

        LIMIT 1`, 
      args: [customerId, productId]
    });

    if (!verifyPurchaseResult.rows.length) {
        return res.status(403).json({
            error: "You cannot review a product you haven't purchased"
        });
    }

    const existingReview =
        await db.execute({
            sql: `
                SELECT review_id
                FROM review
                WHERE product_id = ?
                AND Customer_id = ?
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
        INSERT INTO review (
          product_id,
          Customer_id,
          rating,
          review_text
        )
        VALUES (?, ?, ?, ?)
      `,
      args: [productId, customerId, rating, reviewText],
    });

    return res.status(201).json({
      message: "Review added successfully",
      reviewId: Number(result.lastInsertRowid),
    });
  } catch (error) {
    console.error("Failed to put review:", error);

    return res.status(500).json({
      error: "Failed to put review",
    });
  }
});


/* Allows logged-in users to update their own reviews. The user must be authenticated and the review must belong to them. */
app.put("/updateReview", checkAuth("user"), async (req, res) => {

        try {
            const customerId = Number(req.user.userId);
            const reviewId = Number(req.body.reviewId);
            const rating = Number(req.body.rating);
            const reviewText = req.body.review_text;

            if (!customerId) {
              return res.status(401).json({
                error: "Customer is not logged in",
              });
            }

            if (!reviewId) {
                return res.status(400).json({
                    error: "A valid reviewId is required",
                });
            }

            if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
              return res.status(400).json({
                error: "Rating must be an integer between 1 and 5",
              });
            }

            if (!reviewText || typeof reviewText !== "string") {
              return res.status(400).json({
                error: "Review text is required",
              });
            }

            const result = await db.execute({
                sql: `
                    UPDATE review
                    SET
                        rating = ?,
                        review_text = ?
                    WHERE review_id = ?
                    AND Customer_id = ?
                `,
                args: [rating, reviewText, reviewId, customerId]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({
                    error: "Review not found or you do not own this review"
                });
            }

            return res.json({
                message:
                    "Review updated successfully"
            });

        } catch(error) {
            console.error(error);
            return res.status(500).json({
                error:
                    "Failed to update review"
            });
        }
    }
);

/* DELETE LOGGED-IN USER REVIEW */
app.delete("/deleteReview", checkAuth("user"), async (req, res) => {
  try {
    const customerId = Number(req.user.userId);
    const reviewId = Number(req.body.reviewId);

    if (!customerId) {
      return res.status(401).json({
        error: "Customer is not logged in",
      });
    }

    if (!reviewId) {
      return res.status(400).json({
        error: "A valid reviewId is required",
      });
    }

    const result = await db.execute({
      sql: `
        DELETE FROM review
        WHERE review_id = ?
          AND Customer_id = ?
      `,
      args: [reviewId, customerId],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        error: "Review not found or you do not own this review",
      });
    }

    return res.json({
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete review:", error);

    return res.status(500).json({
      error: "Failed to delete review",
    });
  }
});

module.exports = app;
