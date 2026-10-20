const express = require("express");
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");
const { logAudit } = require("../Audit/AuditImport");
const { sendAdminInvitation } = require("../../imports/email");
const { ensureAdminInvitationTable, createInvitationToken, hashInvitationToken } = require("../../imports/adminInvitations");
const { refreshAdminSession } = require("../../imports/adminSession");

const router = express.Router();
router.customPath = "/api/admin";
router.use(checkAuth("admin"));


const fail = (res, error, message) => {
  console.error(message, error);
  return res.status(500).json({ error: message });
};

const DASHBOARD_LOW_STOCK_THRESHOLD = 20;

router.post("/session/heartbeat", async (req, res) => {
  try {
    const renewed = await refreshAdminSession(Number(req.user.adminId), String(req.user.sid || ""));
    if (!renewed) return res.status(401).json({ error: "Admin session expired. Please sign in again." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ active: true });
  } catch (error) {
    fail(res, error, "Unable to refresh admin session");
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.today || "")) ? req.query.today : null;
    const [orders, concerns, admin] = await Promise.all([
      db.execute({
        sql: `SELECT o.Order_id, o.Customer_id, GROUP_CONCAT(DISTINCT oi.Product_id) AS Product_ids, os.Order_status
              FROM Orders o
              LEFT JOIN Order_status os ON os.Status_id = o.Status_id
              LEFT JOIN Order_items oi ON oi.Order_id = o.Order_id
              WHERE date(o.Order_date) = COALESCE(?, date('now', 'localtime'))
              GROUP BY o.Order_id, o.Customer_id, os.Order_status, o.Order_date
              ORDER BY o.Order_date DESC, o.Order_id DESC LIMIT 10`,
        args: [today],
      }),
      db.execute({
        sql: `SELECT product_id, Prod_name, Prod_amount
              FROM Product
              WHERE Prod_amount <= ?
              ORDER BY Prod_amount ASC, product_id ASC`,
        args: [DASHBOARD_LOW_STOCK_THRESHOLD],
      }),
      db.execute({
        sql: "SELECT First_name, Last_name FROM Admin WHERE Admin_id = ?",
        args: [req.user.adminId],
      }),
    ]);
    const adminName = [admin.rows[0]?.First_name, admin.rows[0]?.Last_name].filter(Boolean).join(" ") || "Admin";
    res.json({ recentOrders: orders.rows, concerns: concerns.rows, adminName });
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

router.get("/accounts/invite-candidates", async (_req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT c.Customer_id AS accountId, c.first_name, c.last_name
            FROM Customer c
            WHERE LOWER(COALESCE(c.Status, '')) = 'enabled'
              AND NOT EXISTS (
                SELECT 1 FROM Admin a WHERE LOWER(a.Admin_email) = LOWER(c.Cus_email)
              )
            ORDER BY c.first_name, c.last_name, c.Customer_id`,
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve invite candidates");
  }
});

router.post("/accounts/invitations", async (req, res) => {
  const customerId = Number(req.body.customerId);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!Number.isInteger(customerId) || customerId < 1 || !password)
    return res.status(400).json({ error: "Select a customer and enter your admin password" });

  try {
    const adminResult = await db.execute({
      sql: `SELECT First_name, Last_name FROM Admin
            WHERE Admin_id = ? AND Admin_password = ?
              AND LOWER(COALESCE(Account_status, 'enabled')) NOT IN ('disabled', 'suspended')`,
      args: [req.user.adminId, password],
    });
    if (!adminResult.rows.length)
      return res.status(403).json({ error: "Admin password is incorrect" });

    const customerResult = await db.execute({
      sql: `SELECT c.Customer_id, c.first_name, c.last_name, c.Cus_email, c.Cus_password
            FROM Customer c
            WHERE c.Customer_id = ? AND LOWER(COALESCE(c.Status, '')) = 'enabled'
              AND NOT EXISTS (
                SELECT 1 FROM Admin a WHERE LOWER(a.Admin_email) = LOWER(c.Cus_email)
              )`,
      args: [customerId],
    });
    const customer = customerResult.rows[0];
    if (!customer) return res.status(404).json({ error: "Enabled customer not found or already an admin" });
    if (!customer.Cus_password)
      return res.status(409).json({ error: "This customer has no password set and cannot sign in to the admin portal yet" });

    await ensureAdminInvitationTable();
    const token = createInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const invitationTx = await db.transaction("write");
    try {
      await invitationTx.execute({
        sql: `UPDATE Admin_invitations SET Status = 'superseded'
              WHERE Customer_id = ? AND Status = 'pending'`,
        args: [customerId],
      });
      await invitationTx.execute({
        sql: `INSERT INTO Admin_invitations
                (Customer_id, Customer_email, Invited_by, Token_hash, Expires_at, Status)
              VALUES (?, ?, ?, ?, ?, 'pending')`,
        args: [customerId, customer.Cus_email, req.user.adminId, tokenHash, expiresAt],
      });
      await invitationTx.commit();
    } catch (error) {
      await invitationTx.rollback();
      throw error;
    }

    const inviterName = [adminResult.rows[0].First_name, adminResult.rows[0].Last_name].filter(Boolean).join(" ") || "A Caravan administrator";
    const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
    const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(configuredBaseUrl);
    const baseUrl = String(configuredBaseUrl && !isLocalBaseUrl ? configuredBaseUrl : "https://green-porcupine-191590.hostingersite.com").replace(/\/+$/, "");
    const invitationUrl = `${baseUrl}/admin-invitation/?token=${encodeURIComponent(token)}`;
    try {
      await sendAdminInvitation({
        customerEmail: customer.Cus_email,
        customerName,
        inviterName,
        invitationUrl,
        expiresAt,
      });
    } catch (emailError) {
      await db.execute({
        sql: "UPDATE Admin_invitations SET Status = 'email_failed' WHERE Token_hash = ? AND Status = 'pending'",
        args: [tokenHash],
      });
      console.error("Unable to send admin invitation email:", emailError);
      return res.status(502).json({ error: "The invitation email could not be sent. Check email configuration and try again." });
    }

    res.status(202).json({ sent: true, customerName });
  } catch (error) {
    fail(res, error, "Unable to send admin invitation");
  }
});

router.get("/accounts/customer/:accountId/vouchers/available", async (req, res) => {
  const customerId = Number(req.params.accountId);
  if (!Number.isInteger(customerId) || customerId < 1)
    return res.status(400).json({ error: "Invalid customer ID" });
  try {
    const result = await db.execute({
      sql: `SELECT v.Voucher_id, v.Voucher_name, v.Voucher_desc, v.discount
            FROM Vouchers v
            WHERE NOT EXISTS (
              SELECT 1 FROM Customer_vouchers cv
              WHERE cv.Customer_id = ? AND cv.Voucher_id = v.Voucher_id
                AND LOWER(COALESCE(cv.Voucher_status, '')) = 'unused'
            )
            ORDER BY v.Voucher_id`,
      args: [customerId],
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve available vouchers");
  }
});

router.post("/accounts/customer/:accountId/vouchers", async (req, res) => {
  const customerId = Number(req.params.accountId);
  const voucherId = Number(req.body.voucherId);
  if (!Number.isInteger(customerId) || customerId < 1 || !Number.isInteger(voucherId) || voucherId < 1)
    return res.status(400).json({ error: "Valid customerId and voucherId are required" });
  try {
    const [customer, voucher, existingAssignment] = await Promise.all([
      db.execute({ sql: "SELECT Customer_id FROM Customer WHERE Customer_id = ?", args: [customerId] }),
      db.execute({ sql: "SELECT Voucher_id, Voucher_name FROM Vouchers WHERE Voucher_id = ?", args: [voucherId] }),
      db.execute({ sql: "SELECT Voucher_status FROM Customer_vouchers WHERE Customer_id = ? AND Voucher_id = ?", args: [customerId, voucherId] }),
    ]);
    if (!customer.rows.length) return res.status(404).json({ error: "Customer not found" });
    if (!voucher.rows.length) return res.status(404).json({ error: "Voucher not found" });

    const inserted = await db.execute({
      sql: `INSERT INTO Customer_vouchers (Customer_id, Voucher_id, Voucher_status)
            VALUES (?, ?, 'Unused')
            ON CONFLICT(Customer_id, Voucher_id) DO UPDATE SET Voucher_status = 'Unused'
            WHERE LOWER(COALESCE(Customer_vouchers.Voucher_status, '')) <> 'unused'`,
      args: [customerId, voucherId],
    });
    if (!inserted.rowsAffected)
      return res.status(409).json({ error: "This customer already has an unused copy of that voucher" });

    const voucherName = voucher.rows[0].Voucher_name || `Voucher #${voucherId}`;
    const wasUsed = existingAssignment.rows[0]?.Voucher_status?.toLowerCase() === "used";
    await logAudit({
      adminId: req.user.adminId,
      type: "customer_voucher",
      description: `${wasUsed ? "Reissued used" : "Gave"} ${voucherName} (Voucher #${voucherId}) to customer #${customerId} with status Unused`,
    });
    res.status(201).json({ customerId, voucherId, voucherName, status: "Unused" });
  } catch (error) {
    fail(res, error, "Unable to give voucher to customer");
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
  if (!(action === "admin_view" && Number.isInteger(accountId) && accountId > 0))
    return res.status(400).json({ error: "Unsupported account action" });
  await logAudit({
    adminId: req.user.adminId,
    type: "account_view",
    description: `Viewed admin account #${accountId}`,
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
      sql: `SELECT c.content_id, c.Main_text, c.update_date, c.content_type_id, ct.content_type_name FROM Content c LEFT JOIN Content_type ct ON ct.content_type_id = c.content_type_id ORDER BY c.content_type_id`,
    });
    res.json(result.rows);
  } catch (error) {
    fail(res, error, "Unable to retrieve content");
  }
});

router.put("/content/:contentId", async (req, res) => {
  const id = Number(req.params.contentId);
  const { mainText } = req.body;
  if (!Number.isInteger(id) || id < 1 || typeof mainText !== "string")
    return res
      .status(400)
      .json({ error: "contentId and mainText are required" });
  try {
    const result = await db.execute({
      sql: "UPDATE Content SET Main_text = ?, update_date = CURRENT_TIMESTAMP WHERE content_id = ?",
      args: [mainText, id],
    });
    if (!result.rowsAffected)
      return res.status(404).json({ error: "Content not found" });
    const updated = await db.execute({
      sql: `SELECT c.content_id, c.Main_text, c.update_date, c.content_type_id, ct.content_type_name FROM Content c LEFT JOIN Content_type ct ON ct.content_type_id = c.content_type_id WHERE c.content_id = ?`,
      args: [id],
    });
    const row = updated.rows[0];
    await logAudit({
      adminId: req.user.adminId,
      type: "content_update",
      description: `Updated ${row?.content_type_name || "website content"} text (Content #${id})`,
    });
    res.json(row);
  } catch (error) {
    fail(res, error, "Unable to update content");
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
