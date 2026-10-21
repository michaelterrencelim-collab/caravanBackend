const express = require("express");
const app = express.Router();
const path = require("path");
const { requireAuth } = require("../../imports/token");

const db = require("../../imports/database");
app.customPath = "/api";

app.get("/fetchProducts", async (req, res) => {
  const { productId } = req.query;

  try {
    const params = [];
    let whereClause = "WHERE LOWER(COALESCE(p.Status, 'Shown')) = 'shown'";

    if (productId) {
      whereClause += " AND p.product_id = ?";
      params.push(productId);
    }

    const result = await db.execute({
      sql: `
        SELECT
          p.product_id,
          p.type_id,
          t.type_name,
          p.Prod_name,
          p.Prod_likes,
          p.Prod_price,
          p.Prod_amount,
          p.Prod_img,
          p."desc",
          COALESCE(review_summary.average_rating, 0) AS product_rating,
          COALESCE(review_summary.review_count, 0) AS review_count,

          c.country_id,
          c.country_name,

          cat.category_id,
          cat.category_name

        FROM Product p

        LEFT JOIN Countries c
          ON p.country_id = c.country_id

        LEFT JOIN Product_categories pc
          ON p.product_id = pc.product_id

        LEFT JOIN Categories cat
          ON pc.category_id = cat.category_id

        LEFT JOIN Type t
            ON p.type_id = t.type_id

        LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS average_rating,
            COUNT(*) AS review_count
          FROM Review
          GROUP BY product_id
        ) review_summary
          ON review_summary.product_id = p.product_id

        ${whereClause}

        ORDER BY
          p.product_id,
          cat.category_id
      `,
      args: params,
    });

    // Group SQL rows into products
    const products = {};

    for (const row of result.rows) {
      if (!products[row.product_id]) {
        products[row.product_id] = {
          product_id: row.product_id,
          type_id: row.type_id,
          type_name: row.type_name,
          product_name: row.Prod_name,
          product_price: row.Prod_price,
          product_amount: row.Prod_amount,
          product_likes: row.Prod_likes,
          product_rating: Number(row.product_rating) || 0,
          review_count: Number(row.review_count) || 0,
          product_desc: row.desc,
          product_category: [],
          product_country: row.country_name,
          product_image: row.Prod_img,
        };
      }

      // Add category only if one exists
      if (row.category_id !== null) {
        products[row.product_id].product_category.push({
          category_id: row.category_id,
          category_name: row.category_name,
        });
      }
    }

    res.json(Object.values(products));
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      error: "Failed to fetch products",
    });
  }
});

// for adding products into database, ONLY ADMIN SIDE 
app.post("/addProduct", requireAuth("admin"), async (req, res) => {
  try {
    const {
      country_id,
      Prod_name,
      Prod_likes,
      Prod_price,
      Prod_amount,
      Prod_img,
      desc,
    } = req.body;

    const result = await db.execute({
      sql: `
        INSERT INTO Product (
          country_id,
          Prod_name,
          Prod_likes,
          Prod_price,
          Prod_amount,
          Prod_img,
          "desc"
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        country_id,
        Prod_name,
        Prod_likes,
        Prod_price,
        Prod_amount,
        Prod_img,
        desc,
      ],
    });

    res.status(201).json({
      message: "Product added successfully",
      product_id: result.lastInsertRowid,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to add product",
    });
  }
});

module.exports = app;
