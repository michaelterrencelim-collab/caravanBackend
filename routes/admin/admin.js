const express = require("express");
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");

const router = express.Router();
router.customPath = "/api/admin";
router.use(checkAuth("admin"));


const fail = (res, error, message) => {
  console.error(message, error);
  return res.status(500).json({ error: message });
};

router.get("/dashboard", async (_req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT o.Order_id, o.Customer_id, oi.Product_id, os.Order_status
            FROM Orders o
            LEFT JOIN Order_status os ON os.Status_id = o.Status_id
            LEFT JOIN Order_items oi ON oi.Order_id = o.Order_id
            ORDER BY o.Order_date DESC, o.Order_id DESC LIMIT 10`,
    });
    res.json({ recentOrders: result.rows });
  } catch (error) {
    fail(res, error, "Unable to retrieve dashboard");
  }
});

router.get("/products", async (req, res) => {
  try {
    const { search } = req.query;
    const result = await db.execute({
      sql: `SELECT p.product_id, p.Prod_name, p.Prod_amount, p.Prod_price,
                   p.Prod_img, c.category_name
            FROM Product p
            LEFT JOIN Product_categories pc ON pc.product_id = p.product_id
            LEFT JOIN Categories c ON c.category_id = pc.category_id
            WHERE (? IS NULL OR p.Prod_name LIKE ?)
            ORDER BY p.product_id`,
      args: [search || null, search ? `%${search}%` : null],
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve products");
  }
});

router.put("/products/:productId/stock", async (req, res) => {
  const productId = Number(req.params.productId);
  const quantity = Number(req.body.quantity);
  if (
    !Number.isInteger(productId) ||
    productId < 1 ||
    !Number.isInteger(quantity) ||
    quantity < 0
  )
    return res
      .status(400)
      .json({
        error: "Valid productId and non-negative integer quantity are required",
      });
  try {
    const result = await db.execute({
      sql: "UPDATE Product SET Prod_amount = ? WHERE product_id = ?",
      args: [quantity, productId],
    });
    if (!result.rowsAffected)
      return res.status(404).json({ error: "Product not found" });
    res.json({ productId, quantity });
  } catch (error) {
    fail(res, error, "Unable to update stock");
  }
});

router.post("/products/:productId/stock-adjustments", async (req, res) => {
  const productId = Number(req.params.productId);
  const change = Number(req.body.quantityChange);
  if (
    !Number.isInteger(productId) ||
    productId < 1 ||
    !Number.isInteger(change) ||
    change === 0
  )
    return res
      .status(400)
      .json({
        error:
          "Valid productId and non-zero integer quantityChange are required",
      });
  try {
    const product = await db.execute({
      sql: "SELECT Prod_amount FROM Product WHERE product_id = ?",
      args: [productId],
    });
    if (!product.rows.length)
      return res.status(404).json({ error: "Product not found" });
    const next = Number(product.rows[0].Prod_amount || 0) + change;
    if (next < 0)
      return res
        .status(400)
        .json({ error: "Adjustment would make stock negative" });
    await db.batch(
      [
        {
          sql: "UPDATE Product SET Prod_amount = ? WHERE product_id = ?",
          args: [next, productId],
        },
        {
          sql: "INSERT INTO Stock_adjustments (Adjustment_id, product_id, Admin_id, quantity_change, Adjustement_date) SELECT COALESCE(MAX(Adjustment_id), 0) + 1, ?, ?, ?, CURRENT_TIMESTAMP FROM Stock_adjustments",
          args: [productId, req.user.adminId, change],
        },
      ],
      "write",
    );
    res.status(201).json({ productId, quantity: next, quantityChange: change });
  } catch (error) {
    fail(res, error, "Unable to record stock adjustment");
  }
});

router.get("/accounts", async (_req, res) => {
  try {
    const [customers, admins] = await Promise.all([
      db.execute({
        sql: "SELECT Customer_id AS accountId, first_name, last_name, Cus_email AS email, Status AS account_status FROM Customer ORDER BY Customer_id",
      }),
      db.execute({
        sql: "SELECT Admin_id AS accountId, First_name AS first_name, Last_name AS last_name, Admin_email AS email, Account_status AS account_status, role_id FROM Admin ORDER BY Admin_id",
      }),
    ]);
    res.json({ customers: customers.rows, admins: admins.rows });
  } catch (error) {
    fail(res, error, "Unable to retrieve accounts");
  }
});

router.put("/accounts/:kind/:accountId/status", async (req, res) => {
  const { kind } = req.params;
  const id = Number(req.params.accountId);
  const status = String(req.body.status || "").trim();
  const table =
    kind === "customer" ? "Customer" : kind === "admin" ? "Admin" : null;
  const idColumn = kind === "customer" ? "Customer_id" : "Admin_id";
  const statusColumn = kind === "customer" ? "Status" : "Account_status";
  if (
    !table ||
    !Number.isInteger(id) ||
    id < 1 ||
    !["active", "suspended", "pending"].includes(status.toLowerCase())
  )
    return res
      .status(400)
      .json({ error: "Invalid account kind, ID, or status" });
  try {
    const result = await db.execute({
      sql: `UPDATE ${table} SET ${statusColumn} = ? WHERE ${idColumn} = ?`,
      args: [status, id],
    });
    if (!result.rowsAffected)
      return res.status(404).json({ error: "Account not found" });
    res.json({ accountId: id, status });
  } catch (error) {
    fail(res, error, "Unable to update account status");
  }
});

router.get("/content", async (_req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT c.content_id, c.Admin_id, c.title, c.content_type_id, ct.content_type_name, c.content_status, c.Last_edited FROM Content c LEFT JOIN Content_type ct ON ct.content_type_id = c.content_type_id ORDER BY c.content_id`,
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve content");
  }
});

router.post("/content", async (req, res) => {
  const { title, contentTypeId, status = "Draft" } = req.body;
  if (!title?.trim() || !Number.isInteger(Number(contentTypeId)))
    return res
      .status(400)
      .json({ error: "title and contentTypeId are required" });
  try {
    const result = await db.execute({
      sql: "INSERT INTO Content (content_id, Admin_id, title, content_type_id, content_status, Last_edited) SELECT COALESCE(MAX(content_id), 0) + 1, ?, ?, ?, ?, CURRENT_TIMESTAMP FROM Content RETURNING content_id",
      args: [req.user.adminId, title.trim(), Number(contentTypeId), status],
    });
    res
      .status(201)
      .json({
        contentId: Number(result.rows[0].content_id),
        title: title.trim(),
        status,
      });
  } catch (error) {
    fail(res, error, "Unable to create content");
  }
});

router.put("/content/:contentId", async (req, res) => {
  const id = Number(req.params.contentId);
  const { title, contentTypeId, status } = req.body;
  if (
    !Number.isInteger(id) ||
    id < 1 ||
    !title?.trim() ||
    !Number.isInteger(Number(contentTypeId)) ||
    !status?.trim()
  )
    return res
      .status(400)
      .json({
        error: "contentId, title, contentTypeId, and status are required",
      });
  try {
    const result = await db.execute({
      sql: "UPDATE Content SET title = ?, content_type_id = ?, content_status = ?, Admin_id = ?, Last_edited = CURRENT_TIMESTAMP WHERE content_id = ?",
      args: [
        title.trim(),
        Number(contentTypeId),
        status.trim(),
        req.user.adminId,
        id,
      ],
    });
    if (!result.rowsAffected)
      return res.status(404).json({ error: "Content not found" });
    res.json({ contentId: id, title: title.trim(), status: status.trim() });
  } catch (error) {
    fail(res, error, "Unable to update content");
  }
});

router.delete("/content/:contentId", async (req, res) => {
  const id = Number(req.params.contentId);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid contentId" });
  try {
    const result = await db.execute({
      sql: "DELETE FROM Content WHERE content_id = ?",
      args: [id],
    });
    if (!result.rowsAffected)
      return res.status(404).json({ error: "Content not found" });
    res.status(204).end();
  } catch (error) {
    fail(res, error, "Unable to delete content");
  }
});

router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const result = await db.execute({
      sql: "SELECT Audit_log_id, Admin_id, action_type, description, action_date FROM Audit ORDER BY action_date DESC LIMIT ?",
      args: [limit],
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve audit log");
  }
});

router.get("/orders", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const result = await db.execute({
      sql: `SELECT o.Order_id, o.Customer_id, o.Status_id, os.Order_status, o.Total_cost, o.Order_date, oi.Product_id, oi.Quantity FROM Orders o LEFT JOIN Order_status os ON os.Status_id = o.Status_id LEFT JOIN Order_items oi ON oi.Order_id = o.Order_id ORDER BY o.Order_date DESC LIMIT ?`,
      args: [limit],
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve orders");
  }
});

router.get("/sales", async (_req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.product_id, p.Prod_name, SUM(oi.Quantity) AS units_sold, SUM(oi.Quantity * oi.Unit_price) AS sales_total FROM Order_items oi JOIN Orders o ON o.Order_id = oi.Order_id JOIN Product p ON p.product_id = oi.Product_id GROUP BY p.product_id, p.Prod_name ORDER BY sales_total DESC`,
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve sales report");
  }
});

module.exports = router;
