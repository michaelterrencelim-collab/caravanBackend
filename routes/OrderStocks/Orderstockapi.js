const express = require("express");
const app = express.Router();
const db = require("../../imports/database");
const { requireAuth } = require("../../imports/token");
const { logAudit, getAdminId } = require("../Audit/AuditImport");
app.customPath = "/api";
const adminOnly = requireAuth("admin");

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const LOW_STOCK_THRESHOLD = 20; 
const STATUS_RETURNED = "Returned"; 
const STATUS_REFUNDED = "Refunded"; 
const RETURN_STATUS_DEFAULT = "Received"; 
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const EXPORT_MAX_ORDERS = 10000;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function getPaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

function likeParam(text) {
  return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function sendCsv(res, filenamePrefix, header, rows) {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filenamePrefix}-${Date.now()}.csv"`);
  res.send("\ufeff" + lines.join("\n"));
}

function stockStatus(amount) {
  const n = Number(amount);
  if (n <= 0) return { status: "out-of-stock", level: "out", label: "Out of Stock" };
  if (n <= LOW_STOCK_THRESHOLD) return { status: "low-stock", level: "low", label: "Low On Stock" };
  return { status: "in-stock", level: "full", label: "In Stock" };
}

// ===========================================================================
// ORDERS REPORTS
// ===========================================================================

const ORDER_FROM = `
  FROM Orders o
  INNER JOIN Order_status os ON o.Status_id = os.Status_id
  LEFT JOIN Customer c ON o.Customer_id = c.Customer_id
  LEFT JOIN Address a ON o.Address_id = a.Address_id
  LEFT JOIN Payment_method pm ON o.Method_id = pm.Method_id
`;

const ORDER_COLUMNS = `
  o.Order_id,
  o.Order_date,
  o.Total_cost,
  o.Shipping_fee,
  o.Status_id,
  os.Order_status,
  o.Customer_id,
  (c.first_name || ' ' || c.last_name) AS Customer_name,
  c.Cus_email AS Customer_email,
  pm.Payment_method AS Payment_method,
  a.Street_address,
  a.City,
  a.Zip_code
`;

const ORDER_SORTS = {
  "date-desc": "o.Order_date DESC, o.Order_id DESC",
  "date-asc": "o.Order_date ASC, o.Order_id ASC",
  "total-desc": "o.Total_cost DESC",
  "total-asc": "o.Total_cost ASC",
  "id-desc": "o.Order_id DESC",
  "id-asc": "o.Order_id ASC",
};
function buildOrderFilter(query) {
  const where = [];
  const args = [];

  if (query.orderId) {
    where.push("o.Order_id = ?");
    args.push(Number(query.orderId));
  }
  if (query.status) {
    where.push("o.Status_id = ?");
    args.push(Number(query.status));
  }
  if (query.customer) {
    where.push("o.Customer_id = ?");
    args.push(Number(query.customer));
  }
  if (query.search) {
    const like = likeParam(query.search);
    where.push(`(
      CAST(o.Order_id AS TEXT) LIKE ? ESCAPE '\\'
      OR CAST(o.Customer_id AS TEXT) LIKE ? ESCAPE '\\'
      OR (c.first_name || ' ' || c.last_name) LIKE ? ESCAPE '\\'
      OR c.Cus_email LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM Order_items oi2
        INNER JOIN Product p2 ON oi2.Product_id = p2.product_id
        WHERE oi2.Order_id = o.Order_id AND p2.Prod_name LIKE ? ESCAPE '\\'
      )
    )`);
    args.push(like, like, like, like, like);
  }
  if (query.from) {
    where.push("date(o.Order_date) >= date(?)");
    args.push(query.from);
  }
  if (query.to) {
    where.push("date(o.Order_date) <= date(?)");
    args.push(query.to);
  }

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}
async function attachItems(orderRows) {
  if (!orderRows.length) return [];

  const ids = orderRows.map((r) => r.Order_id);
  const placeholders = ids.map(() => "?").join(",");

  const itemResult = await db.execute({
    sql: `
      SELECT
        oi.Order_item_id,
        oi.Order_id,
        oi.Product_id,
        oi.Product_Size,
        oi.Quantity,
        oi.Unit_price,
        COALESCE(p.Prod_name, 'Unknown product') AS Prod_name,
        p.Prod_img,
        (SELECT r.return_status
           FROM Returns r
          WHERE r.Order_id = oi.Order_id
          ORDER BY r.request_date DESC
          LIMIT 1) AS Return_status
      FROM Order_items oi
      LEFT JOIN Product p ON oi.Product_id = p.product_id
      WHERE oi.Order_id IN (${placeholders})
      ORDER BY oi.Order_id, oi.Order_item_id
    `,
    args: ids,
  });

  const itemsByOrder = {};
  for (const row of itemResult.rows) {
    const qty = Number(row.Quantity);
    const unit = Number(row.Unit_price);
    (itemsByOrder[row.Order_id] ||= []).push({
      Order_item_id: row.Order_item_id,
      Product_id: row.Product_id,
      Prod_name: row.Prod_name,
      Prod_img: row.Prod_img,
      Product_size: row.Product_Size,
      Quantity: qty,
      Unit_price: unit,
      Line_total: round2(qty * unit),
      Return_status: row.Return_status || null,
    });
  }

  return orderRows.map((r) => {
    const items = itemsByOrder[r.Order_id] || [];
    return {
      Order_id: r.Order_id,
      Order_date: r.Order_date,
      Status_id: r.Status_id,
      Order_status: r.Order_status,
      Customer_id: r.Customer_id,
      Customer_name: r.Customer_name,
      Customer_email: r.Customer_email,
      Payment_method: r.Payment_method || null,
      Address: {
        Street_address: r.Street_address,
        City: r.City,
        Zip_code: r.Zip_code,
      },
      Shipping_fee: Number(r.Shipping_fee) || 0,
      Subtotal: round2(items.reduce((sum, i) => sum + i.Line_total, 0)),
      Total_cost: Number(r.Total_cost) || 0,
      items,
    };
  });
}

app.get("/fetchOrderStatuses", adminOnly, async (req, res) => {
  try {
    const result = await db.execute("SELECT Status_id, Order_status FROM Order_status ORDER BY Status_id");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching order statuses:", error);
    res.status(500).json({ error: "Failed to fetch order statuses" });
  }
});

app.get("/fetchOrders", adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = getPaging(req.query);
    const { whereSql, args } = buildOrderFilter(req.query);
    const orderBy = ORDER_SORTS[req.query.sort] || ORDER_SORTS["date-desc"];

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS total ${ORDER_FROM} ${whereSql}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    const result = await db.execute({
      sql: `
        SELECT ${ORDER_COLUMNS}
        ${ORDER_FROM}
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    res.json({
      orders: await attachItems(result.rows),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: `Failed to fetch orders: ${error.message}` });
  }
});

app.get("/exportOrders", adminOnly, async (req, res) => {
  try {
    const { whereSql, args } = buildOrderFilter(req.query);
    const orderBy = ORDER_SORTS[req.query.sort] || ORDER_SORTS["date-desc"];

    const result = await db.execute({
      sql: `
        SELECT ${ORDER_COLUMNS}
        ${ORDER_FROM}
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ${EXPORT_MAX_ORDERS}
      `,
      args,
    });
    const orders = await attachItems(result.rows);

    const rows = [];
    for (const o of orders) {
      const base = [o.Order_id, o.Order_date, o.Customer_name, o.Customer_email, o.Order_status, o.Payment_method];
      const tail = [o.Shipping_fee, o.Total_cost];
      if (!o.items.length) rows.push([...base, "", "", "", "", "", ...tail]);
      for (const i of o.items) {
        rows.push([...base, i.Prod_name, i.Product_size, i.Quantity, i.Unit_price, i.Line_total, ...tail]);
      }
    }

    sendCsv(
      res,
      "orders-report",
      ["Order ID", "Order Date", "Customer", "Email", "Status", "Payment Method",
       "Product", "Size", "Qty", "Unit Price", "Line Total", "Shipping Fee", "Order Total"],
      rows
    );
  } catch (error) {
    console.error("Error exporting orders:", error);
    res.status(500).json({ error: "Failed to export orders" });
  }
});

app.post("/updateOrderStatus", adminOnly, async (req, res) => {
  try {
    const orderId = Number(req.body.order_id);
    const statusId = Number(req.body.status_id);
    if (!Number.isInteger(orderId) || !Number.isInteger(statusId)) {
      return res.status(400).json({ error: "order_id and status_id must be integers" });
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
    if (oldStatus === newStatus) {
      return res.status(409).json({ error: `Order #${orderId} is already ${oldStatus}` });
    }

    await db.execute({
      sql: "UPDATE Orders SET Status_id = ? WHERE Order_id = ?",
      args: [statusId, orderId],
    });

    await logAudit({
      adminId: getAdminId(req),
      description: `Updated Order "#${orderId}" status from ${oldStatus} → ${newStatus}`,
    });

    res.json({ message: "Order status updated", Order_id: orderId, Status_id: statusId, Order_status: newStatus });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

async function setOrderStatusByName(req, res, { targetName, blockedFrom }) {
  try {
    const orderId = Number(req.body.order_id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: "order_id must be an integer" });

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
    res.status(500).json({ error: "Failed to update order" });
  }
}

app.post("/returnOrder", adminOnly, (req, res) =>
  setOrderStatusByName(req, res, {
    targetName: STATUS_RETURNED,
    blockedFrom: [STATUS_RETURNED, STATUS_REFUNDED],
  })
);

app.post("/refundOrder", adminOnly, (req, res) =>
  setOrderStatusByName(req, res, {
    targetName: STATUS_REFUNDED,
    blockedFrom: [STATUS_REFUNDED],
  })
);

// ===========================================================================
// STOCK INVENTORY
// ===========================================================================

function buildStockFilter(query) {
  const filter = query.filter || "all";
  const search = (query.search || "").trim();
  const where = ["LOWER(COALESCE(p.Status, 'Shown')) <> 'deleted'"];
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

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}
app.get("/fetchStocks", adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = getPaging(req.query);
    const { whereSql, args } = buildStockFilter(req.query);

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM Product p ${whereSql}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    const summaryResult = await db.execute({
      sql: `
        SELECT
          COUNT(*) AS total_products,
          COALESCE(SUM(CASE WHEN Prod_amount <= 0 THEN 1 ELSE 0 END), 0) AS out_count,
          COALESCE(SUM(CASE WHEN Prod_amount > 0 AND Prod_amount <= ? THEN 1 ELSE 0 END), 0) AS low_count
        FROM Product
        WHERE LOWER(COALESCE(Status, 'Shown')) <> 'deleted'
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
        status: st.status, 
        level: st.level, 
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
    console.error("Error fetching stocks:", error);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
});

app.get("/exportStocks", adminOnly, async (req, res) => {
  try {
    const { whereSql, args } = buildStockFilter(req.query);
    const result = await db.execute({
      sql: `
        SELECT p.product_id, p.Prod_name, p.Prod_amount
        FROM Product p
        ${whereSql}
        ORDER BY p.Prod_amount ASC, p.product_id ASC
      `,
      args,
    });

    sendCsv(
      res,
      "stock-inventory",
      ["Product ID", "Product Name", "Stock", "Status"],
      result.rows.map((r) => [r.product_id, r.Prod_name, Number(r.Prod_amount), stockStatus(r.Prod_amount).label])
    );
  } catch (error) {
    console.error("Error exporting stocks:", error);
    res.status(500).json({ error: "Failed to export stocks" });
  }
});
app.get("/fetchStockHistory", adminOnly, async (req, res) => {
  try {
    const productId = Number(req.query.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "productId is required" });
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
    console.error("Error fetching stock history:", error);
    res.status(500).json({ error: "Failed to fetch stock history" });
  }
});
app.post("/adjustStock", adminOnly, async (req, res) => {
  try {
    const productId = Number(req.body.product_id);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "product_id is required" });

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
    const adminId = getAdminId(req);
    const newAmount = oldAmount + delta;

    // Step 1: guarded update. Only succeeds if stock is still what the admin saw.
    const update = await db.execute({
      sql: "UPDATE Product SET Prod_amount = ? WHERE product_id = ? AND Prod_amount = ?",
      args: [newAmount, productId, oldAmount],
    });
    if (!update.rowsAffected) {
      return res.status(409).json({ error: "Stock changed while you were editing. Please refresh and retry." });
    }

    // Step 2: history + audit. Plain inserts (no changes() trick), and a failure here
    // must not make the admin think the stock update failed, since it already succeeded.
    try {
      await db.batch(
        [
          {
            sql: "INSERT INTO Stock_adjustments (product_id, Admin_id, quantity_change, Adjustment_date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            args: [productId, adminId, delta],
          },
          {
            sql: "INSERT INTO Audit (Admin_id, action_type, description, action_date) VALUES (?, 'action', ?, CURRENT_TIMESTAMP)",
            args: [adminId, `Updated Stock for "${name}" from ${oldAmount} → ${newAmount}`],
          },
        ],
        "write"
      );
    } catch (logError) {
      console.error("Stock updated but history/audit write failed:", logError);
    }

    res.json({
      product_id: productId,
      quantity_change: delta,
      new_stock: newAmount,
      ...stockStatus(newAmount),
    });
  } catch (error) {
    console.error("Error adjusting stock:", error);
    res.status(500).json({ error: `Failed to adjust stock: ${error.message}` });
  }
});
app.get("/fetchReturnableItems", adminOnly, async (req, res) => {
  try {
    const productId = Number(req.query.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "productId is required" });

    const result = await db.execute({
      sql: `
        SELECT
          oi.Order_item_id,
          oi.Order_id,
          o.Order_date,
          oi.Quantity,
          oi.Unit_price,
          EXISTS (SELECT 1 FROM Returns r WHERE r.Order_id = oi.Order_id) AS Already_returned
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
    console.error("Error fetching returnable items:", error);
    res.status(500).json({ error: "Failed to fetch order items" });
  }
});

app.post("/logStockReturn", adminOnly, async (req, res) => {
  try {
    const productId = Number(req.body.product_id);
    const orderItemId = Number(req.body.order_item_id);
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(productId) || !Number.isInteger(orderItemId)) {
      return res.status(400).json({ error: "product_id and order_item_id are required" });
    }
    if (!reason) return res.status(400).json({ error: "A reason is required" });

    const itemResult = await db.execute({
      sql: `
        SELECT oi.Order_item_id, oi.Order_id, oi.Quantity, oi.Unit_price, p.Prod_name
        FROM Order_items oi
        INNER JOIN Product p ON oi.Product_id = p.product_id
        WHERE oi.Order_item_id = ? AND oi.Product_id = ?
      `,
      args: [orderItemId, productId],
    });
    if (!itemResult.rows.length) {
      return res.status(404).json({ error: "That order line does not belong to this product" });
    }
    const item = itemResult.rows[0];

    const existing = await db.execute({
      sql: "SELECT 1 FROM Returns WHERE Order_id = ? LIMIT 1",
      args: [item.Order_id],
    });
    if (existing.rows.length) {
      return res.status(409).json({ error: "A return is already logged for this order" });
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
          INSERT INTO Returns (Order_id, Reason, Return_status, Refund_amount, request_date)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [item.Order_id, reason, RETURN_STATUS_DEFAULT, refund],
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
        VALUES (?, 'action', ?, CURRENT_TIMESTAMP)
      `,
      args: [
        adminId,
        `Logged a return of ${qty} for "${item.Prod_name}" (Order #${item.Order_id})${restock ? "" : ", not restocked"}`,
      ],
    });
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
    res.status(500).json({ error: "Failed to log return" });
  }
});

app.post("/orderStock", adminOnly, async (req, res) => {
  try {
    const productId = Number(req.body.product_id);
    const qty = Number(req.body.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "product_id and a positive whole quantity are required" });
    }

    const current = await db.execute({
      sql: "SELECT Prod_name FROM Product WHERE product_id = ?",
      args: [productId],
    });
    if (!current.rows.length) return res.status(404).json({ error: "Product not found" });

    await logAudit({
      adminId: getAdminId(req),
      description: `Ordered ${qty} more stock for "${current.rows[0].Prod_name}"`,
    });

    res.status(201).json({ message: "Stock order recorded", product_id: productId, quantity: qty });
  } catch (error) {
    console.error("Error recording stock order:", error);
    res.status(500).json({ error: "Failed to record stock order" });
  }
});

module.exports = app;
