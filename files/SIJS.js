const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const { requireAuth } = require("../../imports/token");
const { logAudit, getAdminId } = require("../Audit/AuditImport");

// Mounted at /admin/api  (e.g. GET /admin/api/orders, GET /admin/api/stocks)
router.customPath = "/admin/api";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const LOW_STOCK_THRESHOLD = 20; // amount <= this (and > 0) = "Low on Stock"
const STATUS_RETURNED = "Returned"; // must match a row in Order_status
const STATUS_REFUNDED = "Refunded"; // must match a row in Order_status
const RETURN_STATUS_DEFAULT = "Received"; // value written to Returns.return_status
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function getPaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

// Escape % and _ so user input is matched literally in LIKE
function likeParam(text) {
  return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function stockStatus(amount) {
  const n = Number(amount);
  if (n <= 0) return { status: "out-of-stock", level: "out", label: "Out of Stock" };
  if (n <= LOW_STOCK_THRESHOLD) return { status: "low-stock", level: "low", label: "Low On Stock" };
  return { status: "in-stock", level: "full", label: "In Stock" };
}

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------

// GET /admin/api/order-statuses
router.get("/order-statuses", requireAuth("admin"), async (req, res) => {
  try {
    const result = await db.execute("SELECT Status_id, Order_status FROM Order_status ORDER BY Status_id");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load order statuses" });
  }
});

// GET /admin/api/orders?status=&search=&from=&to=&sort=&page=&limit=
//   status : Status_id
//   search : order id, customer name or customer email
//   from/to: YYYY-MM-DD
//   sort   : date-desc | date-asc | total-desc | total-asc | id-desc | id-asc
router.get("/orders", requireAuth("admin"), async (req, res) => {
  try {
    const { status, customer, search, from, to, sort } = req.query;
    const fetchAll = req.query.all === "true"; // report mode: no paging (capped at 5000)
    const { page, limit, offset } = getPaging(req.query);

    const where = [];
    const args = [];

    if (status) {
      where.push("o.Status_id = ?");
      args.push(Number(status));
    }
    if (customer) {
      where.push("o.Customer_id = ?");
      args.push(Number(customer));
    }
    if (search) {
      const like = likeParam(search);
      where.push(
        `(CAST(o.Order_id AS TEXT) LIKE ? ESCAPE '\\'
          OR (c.first_name || ' ' || c.last_name) LIKE ? ESCAPE '\\'
          OR c.Cus_email LIKE ? ESCAPE '\\')`
      );
      args.push(like, like, like);
    }
    if (from) {
      where.push("date(o.Order_date) >= date(?)");
      args.push(from);
    }
    if (to) {
      where.push("date(o.Order_date) <= date(?)");
      args.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sortMap = {
      "date-desc": "o.Order_date DESC",
      "date-asc": "o.Order_date ASC",
      "total-desc": "o.Total_cost DESC",
      "total-asc": "o.Total_cost ASC",
      "id-desc": "o.Order_id DESC",
      "id-asc": "o.Order_id ASC",
    };
    const orderBy = sortMap[sort] || sortMap["date-desc"];

    const countResult = await db.execute({
      sql: `
        SELECT COUNT(*) AS total
        FROM Orders o
        LEFT JOIN Customer c ON o.Customer_id = c.Customer_id
        ${whereSql}
      `,
      args,
    });
    const total = Number(countResult.rows[0].total);

    const result = await db.execute({
      sql: `
        SELECT
          o.Order_id,
          o.Order_date,
          o.Total_cost,
          o.Shipping_fee,
          o.Status_id,
          os.Order_status,
          o.Customer_id,
          (c.first_name || ' ' || c.last_name) AS Customer_name,
          (SELECT COALESCE(SUM(oi.Quantity), 0)
             FROM Order_items oi
            WHERE oi.Order_id = o.Order_id) AS Item_count
        FROM Orders o
        INNER JOIN Order_status os ON o.Status_id = os.Status_id
        LEFT JOIN Customer c ON o.Customer_id = c.Customer_id
        ${whereSql}
        ORDER BY ${orderBy}
        ${fetchAll ? "LIMIT 5000" : "LIMIT ? OFFSET ?"}
      `,
      args: fetchAll ? args : [...args, limit, offset],
    });

    res.json({
      orders: result.rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Error loading admin orders:", error);
    res.status(500).json({ error: "Unable to load orders" });
  }
});

// GET /admin/api/orders/:orderId -> full order (customer, address, payment, items)
router.get("/orders/:orderId", requireAuth("admin"), async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Invalid order id" });

    const result = await db.execute({
      sql: `
        SELECT
          o.Order_id,
          o.Order_date,
          o.Total_cost,
          o.Shipping_fee,
          o.Status_id,
          os.Order_status,

          c.Customer_id,
          c.first_name,
          c.last_name,
          c.Cus_email,
          c.Cus_phone,

          a.Street_address,
          a.City,
          a.Zip_code,

          pm.Payment_method AS Payment_method,

          oi.Order_item_id,
          oi.Product_id,
          oi.Product_Size,
          oi.Quantity,
          oi.Unit_price,
          p.Prod_name,
          p.Prod_img,

          (SELECT r.return_status
             FROM Returns r
            WHERE r.order_item_id = oi.Order_item_id
            ORDER BY r.request_date DESC
            LIMIT 1) AS Return_status
        FROM Orders o
        INNER JOIN Order_status os ON o.Status_id = os.Status_id
        LEFT JOIN Customer c ON o.Customer_id = c.Customer_id
        LEFT JOIN Address a ON o.Address_id = a.Address_id
        LEFT JOIN Payment_method pm ON o.Method_id = pm.Method_id
        INNER JOIN Order_items oi ON o.Order_id = oi.Order_id
        INNER JOIN Product p ON oi.Product_id = p.Product_id
        WHERE o.Order_id = ?
        ORDER BY oi.Order_item_id
      `,
      args: [orderId],
    });

    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });

    const first = result.rows[0];
    const items = result.rows.map((r) => ({
      Order_item_id: r.Order_item_id,
      Product_id: r.Product_id,
      Prod_name: r.Prod_name,
      Prod_img: r.Prod_img,
      Product_size: r.Product_Size,
      Quantity: Number(r.Quantity),
      Unit_price: Number(r.Unit_price),
      Return_status: r.Return_status || null,
    }));

    const subtotal = round2(items.reduce((sum, i) => sum + i.Quantity * i.Unit_price, 0));
    const shipping = Number(first.Shipping_fee) || 0;
    const total = Number(first.Total_cost) || 0;

    res.json({
      Order_id: first.Order_id,
      Order_date: first.Order_date,
      Status_id: first.Status_id,
      Order_status: first.Order_status,
      Customer: {
        Customer_id: first.Customer_id,
        name: first.first_name ? `${first.first_name} ${first.last_name}` : null,
        email: first.Cus_email,
        phone: first.Cus_phone,
      },
      Address: {
        Street_address: first.Street_address,
        City: first.City,
        Zip_code: first.Zip_code,
      },
      Payment_method: first.Payment_method || null,
      Subtotal: subtotal,
      Shipping_fee: shipping,
      Total_cost: total,
      items,
    });
  } catch (error) {
    console.error("Error loading admin order:", error);
    res.status(500).json({ error: "Unable to retrieve order" });
  }
});

// PATCH /admin/api/orders/:orderId/status   body: { status_id }
router.patch("/orders/:orderId/status", requireAuth("admin"), async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const statusId = Number(req.body.status_id);
    if (!Number.isInteger(orderId) || !Number.isInteger(statusId)) {
      return res.status(400).json({ error: "order id and status_id must be integers" });
    }

    const current = await db.execute({
      sql: `
        SELECT os.Order_status
        FROM Orders o
        INNER JOIN Order_status os ON o.Status_id = os.Status_id
        WHERE o.Order_id = ?
      `,
      args: [orderId],
    });
    if (!current.rows.length) return res.status(404).json({ error: "Order not found" });

    const next = await db.execute({
      sql: "SELECT Order_status FROM Order_status WHERE Status_id = ?",
      args: [statusId],
    });
    if (!next.rows.length) return res.status(400).json({ error: "Unknown status" });

    const oldStatus = current.rows[0].Order_status;
    const newStatus = next.rows[0].Order_status;

    await db.execute({
      sql: "UPDATE Orders SET Status_id = ? WHERE Order_id = ?",
      args: [statusId, orderId],
    });

    await logAudit({
      adminId: getAdminId(req),
      type: "updated",
      description: `Updated Order "#${orderId}" status from ${oldStatus} → ${newStatus}`,
    });

    res.json({ message: "Order status updated", Order_id: orderId, Order_status: newStatus });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Unable to update order status" });
  }
});

// GET /admin/api/order-summary -> order count and money per status (Orders Reports header cards)
router.get("/order-summary", requireAuth("admin"), async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        os.Status_id,
        os.Order_status,
        COUNT(o.Order_id) AS order_count,
        COALESCE(SUM(o.Total_cost), 0) AS total_amount
      FROM Order_status os
      LEFT JOIN Orders o ON o.Status_id = os.Status_id
      GROUP BY os.Status_id, os.Order_status
      ORDER BY os.Status_id
    `);
    const statuses = result.rows.map((r) => ({
      Status_id: r.Status_id,
      Order_status: r.Order_status,
      order_count: Number(r.order_count),
      total_amount: round2(r.total_amount),
    }));
    res.json({
      totalOrders: statuses.reduce((n, s) => n + s.order_count, 0),
      statuses,
    });
  } catch (error) {
    console.error("Error loading order summary:", error);
    res.status(500).json({ error: "Unable to load order summary" });
  }
});

// Shared logic for "set this order to a named status" (return / refund).
// The target status is looked up by NAME in the Order_status table, so the
// row must exist there (e.g. Status_id 6 = "Returned", 7 = "Refunded").
async function setOrderStatusByName(req, res, { targetName, blockedFrom }) {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Invalid order id" });

    const current = await db.execute({
      sql: `
        SELECT o.Status_id, os.Order_status
        FROM Orders o
        INNER JOIN Order_status os ON o.Status_id = os.Status_id
        WHERE o.Order_id = ?
      `,
      args: [orderId],
    });
    if (!current.rows.length) return res.status(404).json({ error: "Order not found" });

    const oldStatus = current.rows[0].Order_status;
    if (blockedFrom.some((n) => n.toLowerCase() === String(oldStatus).toLowerCase())) {
      return res.status(409).json({ error: `Order #${orderId} is already ${oldStatus}` });
    }

    const target = await db.execute({
      sql: "SELECT Status_id, Order_status FROM Order_status WHERE LOWER(Order_status) = LOWER(?)",
      args: [targetName],
    });
    if (!target.rows.length) {
      return res.status(409).json({
        error: `The Order_status table has no "${targetName}" row. Add it first, then retry.`,
      });
    }

    const { Status_id: targetId, Order_status: targetLabel } = target.rows[0];

    await db.execute({
      sql: "UPDATE Orders SET Status_id = ? WHERE Order_id = ?",
      args: [targetId, orderId],
    });

    const reason = String(req.body.reason || "").trim().slice(0, 120);
    await logAudit({
      adminId: getAdminId(req),
      type: "updated",
      description:
        `Marked Order "#${orderId}" as ${targetLabel} (was ${oldStatus})` + (reason ? `: ${reason}` : ""),
    });

    res.json({
      message: `Order marked as ${targetLabel}`,
      Order_id: orderId,
      Status_id: targetId,
      Order_status: targetLabel,
      previous_status: oldStatus,
    });
  } catch (error) {
    console.error("Error changing order status:", error);
    res.status(500).json({ error: "Unable to update order" });
  }
}

// POST /admin/api/orders/:orderId/return    body: { reason? }
// Sets the order's status to "Returned".
router.post("/orders/:orderId/return", requireAuth("admin"), (req, res) =>
  setOrderStatusByName(req, res, {
    targetName: STATUS_RETURNED,
    blockedFrom: [STATUS_RETURNED, STATUS_REFUNDED],
  })
);

// POST /admin/api/orders/:orderId/refund    body: { reason? }
// Sets the order's status to "Refunded".
router.post("/orders/:orderId/refund", requireAuth("admin"), (req, res) =>
  setOrderStatusByName(req, res, {
    targetName: STATUS_REFUNDED,
    blockedFrom: [STATUS_REFUNDED],
  })
);

// ---------------------------------------------------------------------------
// STOCK INVENTORY
// ---------------------------------------------------------------------------

// GET /admin/api/stocks?filter=all|in-stock|low-stock|out-of-stock&search=&page=&limit=
router.get("/stocks", requireAuth("admin"), async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    const search = (req.query.search || "").trim();
    const { page, limit, offset } = getPaging(req.query);

    const where = [];
    const args = [];

    if (filter === "out-of-stock") {
      where.push("p.Prod_amount <= 0");
    } else if (filter === "low-stock") {
      where.push("p.Prod_amount > 0 AND p.Prod_amount <= ?");
      args.push(LOW_STOCK_THRESHOLD);
    } else if (filter === "in-stock") {
      where.push("p.Prod_amount > ?");
      args.push(LOW_STOCK_THRESHOLD);
    }

    if (search) {
      where.push("(p.Prod_name LIKE ? ESCAPE '\\' OR CAST(p.product_id AS TEXT) LIKE ? ESCAPE '\\')");
      args.push(likeParam(search), likeParam(search));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM Product p ${whereSql}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    const summaryResult = await db.execute({
      sql: `
        SELECT
          COUNT(*) AS total_products,
          SUM(CASE WHEN Prod_amount <= 0 THEN 1 ELSE 0 END) AS out_count,
          SUM(CASE WHEN Prod_amount > 0 AND Prod_amount <= ? THEN 1 ELSE 0 END) AS low_count
        FROM Product
      `,
      args: [LOW_STOCK_THRESHOLD],
    });
    const s = summaryResult.rows[0];

    const result = await db.execute({
      sql: `
        SELECT p.product_id, p.Prod_name, p.Prod_img, p.Prod_amount
        FROM Product p
        ${whereSql}
        ORDER BY p.Prod_amount ASC, p.product_id ASC
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    const items = result.rows.map((r) => {
      const st = stockStatus(r.Prod_amount);
      return {
        product_id: r.product_id,
        product_name: r.Prod_name,
        product_image: r.Prod_img,
        stock: Number(r.Prod_amount),
        status: st.status, // matches data-status on <tr>
        level: st.level, // level-low | level-full | level-out
        status_label: st.label,
      };
    });

    res.json({
      items,
      summary: {
        totalProducts: Number(s.total_products),
        lowCount: Number(s.low_count),
        outCount: Number(s.out_count),
        needRestock: Number(s.low_count) + Number(s.out_count),
        lowStockThreshold: LOW_STOCK_THRESHOLD,
      },
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Error loading stocks:", error);
    res.status(500).json({ error: "Unable to load stock inventory" });
  }
});

// GET /admin/api/stocks/:productId/history -> Stock_adjustments for one product
router.get("/stocks/:productId/history", requireAuth("admin"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product id" });
    const { page, limit, offset } = getPaging(req.query);

    const result = await db.execute({
      sql: `
        SELECT
          sa.Adjustment_id,
          sa.quantity_change,
          strftime('%Y-%m-%dT%H:%M:%SZ', sa.Adjustment_date) AS Adjustment_date,
          COALESCE(SUBSTR(ad.First_name, 1, 1) || '. ' || ad.Last_name, 'System') AS admin_name
        FROM Stock_adjustments sa
        LEFT JOIN Admin ad ON sa.Admin_id = ad.Admin_id
        WHERE sa.product_id = ?
        ORDER BY sa.Adjustment_date DESC, sa.Adjustment_id DESC
        LIMIT ? OFFSET ?
      `,
      args: [productId, limit, offset],
    });
    res.json({ history: result.rows, page, limit });
  } catch (error) {
    console.error("Error loading stock history:", error);
    res.status(500).json({ error: "Unable to load stock history" });
  }
});

// POST /admin/api/stocks/:productId/adjust
//   body: { new_amount: 50 } (set absolute)  OR  { delta: -5 } (add/subtract)
// Updates Product.Prod_amount, writes a Stock_adjustments row and an Audit row.
router.post("/stocks/:productId/adjust", requireAuth("admin"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product id" });

    const current = await db.execute({
      sql: "SELECT Prod_name, Prod_amount FROM Product WHERE product_id = ?",
      args: [productId],
    });
    if (!current.rows.length) return res.status(404).json({ error: "Product not found" });

    const name = current.rows[0].Prod_name;
    const oldAmount = Number(current.rows[0].Prod_amount);

    let delta;
    if (req.body.new_amount !== undefined) delta = Number(req.body.new_amount) - oldAmount;
    else if (req.body.delta !== undefined) delta = Number(req.body.delta);
    else return res.status(400).json({ error: "Provide new_amount or delta" });

    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: "Change must be a non-zero whole number" });
    }
    if (oldAmount + delta < 0) {
      return res.status(400).json({ error: "Stock cannot go below 0" });
    }

    // One atomic batch (one round trip on Turso). The stock update is guarded, and the
    // Stock_adjustments + Audit inserts only run if that update changed a row
    // (changes() = rows touched by the previous statement), so two admins editing
    // at once can never leave the three tables out of sync.
    const adminId = getAdminId(req);
    const results = await db.batch(
      [
        {
          sql: "UPDATE Product SET Prod_amount = Prod_amount + ? WHERE product_id = ? AND Prod_amount + ? >= 0",
          args: [delta, productId, delta],
        },
        {
          sql: `
            INSERT INTO Stock_adjustments (product_id, Admin_id, quantity_change, Adjustment_date)
            SELECT ?, ?, ?, CURRENT_TIMESTAMP WHERE changes() > 0
          `,
          args: [productId, adminId, delta],
        },
        {
          sql: `
            INSERT INTO Audit (Admin_id, action_type, description, action_date)
            SELECT ?, 'updated', ?, CURRENT_TIMESTAMP WHERE changes() > 0
          `,
          args: [adminId, `Updated Stock for "${name}" from ${oldAmount} → ${oldAmount + delta}`],
        },
        { sql: "SELECT Prod_amount FROM Product WHERE product_id = ?", args: [productId] },
      ],
      "write"
    );

    if (!results[0].rowsAffected) {
      return res.status(409).json({ error: "Stock changed while you were editing. Please refresh and retry." });
    }
    const newAmount = Number(results[3].rows[0].Prod_amount);

    res.json({
      product_id: productId,
      quantity_change: delta,
      new_stock: newAmount,
      ...stockStatus(newAmount),
    });
  } catch (error) {
    console.error("Error adjusting stock:", error);
    res.status(500).json({ error: "Unable to update stock" });
  }
});

// GET /admin/api/stocks/:productId/order-items
// Recent order lines for this product, for the "Log a return" picker.
router.get("/stocks/:productId/order-items", requireAuth("admin"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product id" });

    const result = await db.execute({
      sql: `
        SELECT
          oi.Order_item_id,
          oi.Order_id,
          o.Order_date,
          oi.Quantity,
          oi.Unit_price,
          EXISTS (SELECT 1 FROM Returns r WHERE r.order_item_id = oi.Order_item_id) AS Already_returned
        FROM Order_items oi
        INNER JOIN Orders o ON oi.Order_id = o.Order_id
        WHERE oi.Product_id = ?
        ORDER BY o.Order_date DESC
        LIMIT 25
      `,
      args: [productId],
    });
    res.json(result.rows);
  } catch (error) {
    console.error("Error loading order items:", error);
    res.status(500).json({ error: "Unable to load order items" });
  }
});

// POST /admin/api/stocks/:productId/return
//   body: { order_item_id, reason, quantity?, refund_amount?, restock? }
//   quantity      defaults to the order line's quantity
//   refund_amount defaults to quantity x Unit_price
//   restock       defaults to true (returned units go back into Prod_amount)
// Writes Returns (+ Stock_adjustments and Product update when restocking) and Audit.
router.post("/stocks/:productId/return", requireAuth("admin"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const orderItemId = Number(req.body.order_item_id);
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(productId) || !Number.isInteger(orderItemId)) {
      return res.status(400).json({ error: "product id and order_item_id are required" });
    }
    if (!reason) return res.status(400).json({ error: "A reason is required" });

    const itemResult = await db.execute({
      sql: `
        SELECT oi.Order_item_id, oi.Order_id, oi.Quantity, oi.Unit_price, p.Prod_name
        FROM Order_items oi
        INNER JOIN Product p ON oi.Product_id = p.Product_id
        WHERE oi.Order_item_id = ? AND oi.Product_id = ?
      `,
      args: [orderItemId, productId],
    });
    if (!itemResult.rows.length) {
      return res.status(404).json({ error: "That order line does not belong to this product" });
    }
    const item = itemResult.rows[0];

    const existing = await db.execute({
      sql: "SELECT 1 FROM Returns WHERE order_item_id = ? LIMIT 1",
      args: [orderItemId],
    });
    if (existing.rows.length) {
      return res.status(409).json({ error: "A return is already logged for this order line" });
    }

    const maxQty = Number(item.Quantity);
    const qty = req.body.quantity !== undefined ? Number(req.body.quantity) : maxQty;
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) {
      return res.status(400).json({ error: `Quantity must be a whole number from 1 to ${maxQty}` });
    }

    const refund =
      req.body.refund_amount !== undefined
        ? Number(req.body.refund_amount)
        : round2(qty * Number(item.Unit_price));
    if (!Number.isFinite(refund) || refund < 0) {
      return res.status(400).json({ error: "refund_amount must be 0 or more" });
    }

    const restock = req.body.restock !== false;
    const adminId = getAdminId(req);

    const statements = [
      {
        sql: `
          INSERT INTO Returns (order_item_id, reason, return_status, refund_amount, request_date)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [orderItemId, reason, RETURN_STATUS_DEFAULT, refund],
      },
    ];
    if (restock) {
      statements.push(
        {
          sql: "UPDATE Product SET Prod_amount = Prod_amount + ? WHERE product_id = ?",
          args: [qty, productId],
        },
        {
          sql: `
            INSERT INTO Stock_adjustments (product_id, Admin_id, quantity_change, Adjustment_date)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `,
          args: [productId, adminId, qty],
        }
      );
    }
    statements.push({
      sql: `
        INSERT INTO Audit (Admin_id, action_type, description, action_date)
        VALUES (?, 'updated', ?, CURRENT_TIMESTAMP)
      `,
      args: [
        adminId,
        `Logged a return of ${qty} for "${item.Prod_name}" (Order #${item.Order_id})${restock ? "" : ", not restocked"}`,
      ],
    });

    // One transaction: either everything is saved or nothing is
    await db.batch(statements, "write");

    const fresh = await db.execute({
      sql: "SELECT Prod_amount FROM Product WHERE product_id = ?",
      args: [productId],
    });
    const newAmount = Number(fresh.rows[0].Prod_amount);

    res.status(201).json({
      message: "Return logged",
      order_item_id: orderItemId,
      quantity: qty,
      refund_amount: refund,
      restocked: restock,
      new_stock: newAmount,
      ...stockStatus(newAmount),
    });
  } catch (error) {
    console.error("Error logging return:", error);
    res.status(500).json({ error: "Unable to log return" });
  }
});

// POST /admin/api/stocks/:productId/order    body: { quantity }
// "Order Stocks": there is no purchase-order table in the ERD, so this only
// records the request in the Audit table. Stock changes when you use /adjust.
router.post("/stocks/:productId/order", requireAuth("admin"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const qty = Number(req.body.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "productId and a positive whole quantity are required" });
    }

    const current = await db.execute({
      sql: "SELECT Prod_name FROM Product WHERE product_id = ?",
      args: [productId],
    });
    if (!current.rows.length) return res.status(404).json({ error: "Product not found" });

    await logAudit({
      adminId: getAdminId(req),
      type: "created",
      description: `Ordered ${qty} more stock for "${current.rows[0].Prod_name}"`,
    });

    res.status(201).json({ message: "Stock order recorded", product_id: productId, quantity: qty });
  } catch (error) {
    console.error("Error recording stock order:", error);
    res.status(500).json({ error: "Unable to record stock order" });
  }
});

module.exports = router;