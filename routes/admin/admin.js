const express = require("express");
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");
const { logAudit } = require("../Audit/AuditImport");

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

router.get("/accounts/customer/:accountId/details", async (req, res) => {
  const customerId = Number(req.params.accountId);
  if (!Number.isInteger(customerId) || customerId < 1)
    return res.status(400).json({ error: "Invalid customer ID" });
  try {
    const [customerResult, addressesResult, vouchersResult, ordersResult] = await Promise.all([
      db.execute({
        sql: `SELECT Customer_id AS accountId, first_name, last_name, Cus_email AS email,
                     Cus_phone AS phone, Cus_birthdate AS birthdate, Status AS account_status
              FROM Customer WHERE Customer_id = ?`,
        args: [customerId],
      }),
      db.execute({
        sql: `SELECT Address_id, Street_address, City, Zip_code
              FROM Address WHERE Customer_id = ? ORDER BY Address_id`,
        args: [customerId],
      }),
      db.execute({
        sql: `SELECT v.Voucher_id, v.Voucher_name, v.Voucher_desc, v.discount, cv.Voucher_status
              FROM Customer_vouchers cv
              JOIN Vouchers v ON v.Voucher_id = cv.Voucher_id
              WHERE cv.Customer_id = ? ORDER BY v.Voucher_id`,
        args: [customerId],
      }),
      db.execute({
        sql: `SELECT o.Order_id, o.Order_date, o.Total_cost, o.Shipping_fee, o.Discount,
                     os.Order_status, a.Street_address, a.City, a.Zip_code,
                     oi.Order_item_id, oi.Product_id, p.Prod_name, oi.Quantity, oi.Unit_price, oi.Product_Size
              FROM Orders o
              LEFT JOIN Order_status os ON os.Status_id = o.Status_id
              LEFT JOIN Address a ON a.Address_id = o.Address_id
              LEFT JOIN Order_items oi ON oi.Order_id = o.Order_id
              LEFT JOIN Product p ON p.Product_id = oi.Product_id
              WHERE o.Customer_id = ?
              ORDER BY o.Order_date DESC, o.Order_id DESC, oi.Order_item_id`,
        args: [customerId],
      }),
    ]);

    if (!customerResult.rows.length) return res.status(404).json({ error: "Customer not found" });
    await logAudit({
      adminId: req.user.adminId,
      type: "account_view",
      description: `Viewed customer account #${customerId}`,
    });
    const orders = new Map();
    for (const row of ordersResult.rows) {
      if (!orders.has(Number(row.Order_id))) {
        orders.set(Number(row.Order_id), {
          order_id: Number(row.Order_id),
          order_date: row.Order_date,
          total_cost: Number(row.Total_cost || 0),
          shipping_fee: Number(row.Shipping_fee || 0),
          discount: Number(row.Discount || 0),
          order_status: row.Order_status || "Unknown",
          address: [row.Street_address, row.City, row.Zip_code].filter(Boolean).join(", ") || null,
          items: [],
        });
      }
      if (row.Order_item_id != null) {
        orders.get(Number(row.Order_id)).items.push({
          product_id: Number(row.Product_id),
          product_name: row.Prod_name || `Product ${row.Product_id}`,
          quantity: Number(row.Quantity || 0),
          unit_price: Number(row.Unit_price || 0),
          product_size: row.Product_Size || null,
        });
      }
    }
    res.json({
      customer: customerResult.rows[0],
      addresses: addressesResult.rows,
      vouchers: vouchersResult.rows,
      orders: [...orders.values()],
    });
  } catch (error) {
    fail(res, error, "Unable to retrieve customer details");
  }
});

router.post("/accounts/actions", async (req, res) => {
  const action = String(req.body.action || "");
  const accountId = Number(req.body.accountId);
  if (action !== "invite_opened" && !(action === "admin_view" && Number.isInteger(accountId) && accountId > 0))
    return res.status(400).json({ error: "Unsupported account action" });
  await logAudit({
    adminId: req.user.adminId,
    type: action === "admin_view" ? "account_view" : "account_action",
    description: action === "admin_view"
      ? `Viewed admin account #${accountId}`
      : "Opened the Invite User action in Manage Accounts",
  });
  res.status(201).json({ recorded: true });
});

router.put("/accounts/:kind/:accountId/status", async (req, res) => {
  const { kind } = req.params;
  const id = Number(req.params.accountId);
  const status = String(req.body.status || "").trim();
  const table =
    kind === "customer" ? "Customer" : kind === "admin" ? "Admin" : null;
  const idColumn = kind === "customer" ? "Customer_id" : "Admin_id";
  const statusColumn = kind === "customer" ? "Status" : "Account_status";
  const allowedStatuses = kind === "customer"
    ? ["enabled", "disabled"]
    : ["active", "suspended", "pending", "enabled", "disabled"];
  if (!table || !Number.isInteger(id) || id < 1 || !allowedStatuses.includes(status.toLowerCase()))
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
    await logAudit({
      adminId: req.user.adminId,
      type: "account_status",
      description: `Changed ${kind} account #${id} status to ${status}`,
    });
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
      sql: `SELECT p.product_id, p.Prod_name, t.type_name,
                   COALESCE(s.units_sold, 0) AS units_sold,
                   COALESCE(s.revenue, 0) AS revenue,
                   c.category_id, c.category_name
            FROM Product p
            LEFT JOIN Type t ON t.type_id = p.type_id
            LEFT JOIN (
              SELECT oi.Product_id,
                     SUM(oi.Quantity) AS units_sold,
                     SUM(oi.Quantity * oi.Unit_price) AS revenue
              FROM Order_items oi
              JOIN Orders o ON o.Order_id = oi.Order_id
              LEFT JOIN Order_status os ON os.Status_id = o.Status_id
              WHERE LOWER(COALESCE(os.Order_status, '')) NOT LIKE '%cancel%'
                AND LOWER(COALESCE(os.Order_status, '')) NOT LIKE '%refund%'
                AND LOWER(COALESCE(os.Order_status, '')) NOT LIKE '%return%'
              GROUP BY oi.Product_id
            ) s ON s.Product_id = p.product_id
            LEFT JOIN Product_categories pc ON pc.product_id = p.product_id
            LEFT JOIN Categories c ON c.category_id = pc.category_id
            ORDER BY p.product_id, c.category_name`,
    });

    const products = new Map();
    const categories = new Map();
    for (const row of result.rows) {
      const productId = Number(row.product_id);
      if (!products.has(productId)) {
        products.set(productId, {
          product_id: productId,
          product_name: row.Prod_name,
          type_name: row.type_name || null,
          units_sold: Number(row.units_sold || 0),
          revenue: Number(row.revenue || 0),
          categories: [],
        });
      }
      if (row.category_id != null && row.category_name != null) {
        const product = products.get(productId);
        if (!product.categories.some((category) => category.category_id === Number(row.category_id))) {
          product.categories.push({ category_id: Number(row.category_id), category_name: row.category_name });
        }
        categories.set(Number(row.category_id), row.category_name);
      }
    }

    res.json({
      products: [...products.values()],
      categories: [...categories].map(([category_id, category_name]) => ({ category_id, category_name })),
    });
  } catch (error) {
    fail(res, error, "Unable to retrieve sales report");
  }
});

module.exports = router;
