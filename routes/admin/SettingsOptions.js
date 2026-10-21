const express = require("express");
const db = require("../../imports/database");
const { checkAuth } = require("../../imports/token");
const { logAudit } = require("../Audit/AuditImport");

const router = express.Router();
router.customPath = "/api/admin/settings";
router.use(checkAuth("admin"));

function validateText(value, label, maxLength = 1000) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function nextId(result, columnName) {
  const id = Number(result.rows[0]?.next_id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Unable to assign ${columnName}`);
  return id;
}

async function insertWithNextId(table, idColumn, fields, values) {
  let transaction;
  try {
    transaction = await db.transaction("write");
    const idResult = await transaction.execute({
      sql: `SELECT COALESCE(MAX(${idColumn}), 0) + 1 AS next_id FROM ${table}`,
    });
    const id = nextId(idResult, `${table} ID`);
    const columns = [idColumn, ...fields.map((field) => field.column)];
    const args = [id, ...fields.map((field) => field.value)];
    await transaction.execute({
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      args,
    });
    await transaction.commit();
    transaction = null;
    return id;
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be closed */ }
    }
    throw error;
  }
}

router.get("/options", async (_req, res) => {
  try {
    const [shipping, vouchers] = await Promise.all([
      db.execute({
        sql: `SELECT Shipping_id, Shipping_name, Shipping_text, Cost, Status_id
              FROM Shipping_options ORDER BY Shipping_id`,
      }),
      db.execute({
        sql: `SELECT Voucher_id, Voucher_name, Voucher_desc, discount, Status_id
              FROM Vouchers ORDER BY Voucher_id`,
      }),
    ]);
    res.json({ shipping: shipping.rows, vouchers: vouchers.rows });
  } catch (_error) {
    res.status(500).json({ error: "Unable to load settings options" });
  }
});

router.post("/shipping", async (req, res) => {
  let name;
  let description;
  const cost = Number(req.body.cost);
  try {
    name = validateText(req.body.name, "Shipping name", 255);
    description = validateText(req.body.description, "Shipping text");
    if (!Number.isFinite(cost) || cost < 0 || cost > 99999999.99) {
      return res.status(400).json({ error: "Shipping cost must be a valid non-negative amount" });
    }
    const shippingId = await insertWithNextId("Shipping_options", "Shipping_id", [
      { column: "Shipping_name", value: name },
      { column: "Shipping_text", value: description },
      { column: "Cost", value: cost },
      { column: "Status_id", value: 1 },
    ]);
    await logAudit({
      adminId: req.user.adminId,
      type: "shipping_option_add",
      description: `Added active shipping option ${name} (Shipping #${shippingId}) at ${cost.toFixed(2)}`,
    });
    res.status(201).json({ shippingId, message: "Shipping option added" });
  } catch (error) {
    if (error.message.endsWith("is required") || error.message.includes("characters or fewer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Unable to add shipping option" });
  }
});

router.post("/voucher", async (req, res) => {
  let name;
  let description;
  const discount = Number(req.body.discount);
  try {
    name = validateText(req.body.name, "Voucher name", 255);
    description = validateText(req.body.description, "Voucher description");
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({ error: "Discount must be greater than 0 and at most 100%" });
    }
    const voucherId = await insertWithNextId("Vouchers", "Voucher_id", [
      { column: "Voucher_name", value: name },
      { column: "Voucher_desc", value: description },
      { column: "discount", value: discount },
      { column: "Status_id", value: 1 },
    ]);
    await logAudit({
      adminId: req.user.adminId,
      type: "voucher_add",
      description: `Added active voucher ${name} (Voucher #${voucherId}) with ${discount}% discount`,
    });
    res.status(201).json({ voucherId, message: "Voucher added" });
  } catch (error) {
    if (error.message.endsWith("is required") || error.message.includes("characters or fewer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Unable to add voucher" });
  }
});

router.patch("/shipping/:id", async (req, res) => {
  const shippingId = Number(req.params.id);
  if (!Number.isSafeInteger(shippingId) || shippingId < 1) return res.status(400).json({ error: "Invalid shipping option ID" });
  try {
    const name = validateText(req.body.name, "Shipping name", 255);
    const description = validateText(req.body.description, "Shipping text");
    const cost = Number(req.body.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 99999999.99) {
      return res.status(400).json({ error: "Shipping cost must be a valid non-negative amount" });
    }
    const existing = await db.execute({
      sql: "SELECT Shipping_name, Shipping_text, Cost FROM Shipping_options WHERE Shipping_id = ?",
      args: [shippingId],
    });
    if (!existing.rows.length) return res.status(404).json({ error: "Shipping option not found" });

    const previous = existing.rows[0];
    const changed = name !== String(previous.Shipping_name || "").trim()
      || description !== String(previous.Shipping_text || "").trim()
      || cost !== Number(previous.Cost || 0);
    if (changed) {
      await db.execute({
        sql: `UPDATE Shipping_options
              SET Shipping_name = ?, Shipping_text = ?, Cost = ?
              WHERE Shipping_id = ?`,
        args: [name, description, cost, shippingId],
      });
      await logAudit({
        adminId: req.user.adminId,
        type: "shipping_option_edit",
        description: `Updated shipping option ${previous.Shipping_name} (Shipping #${shippingId}) to ${name} at ${cost.toFixed(2)}`,
      });
    }
    res.json({ shippingId, message: "Shipping option updated" });
  } catch (error) {
    if (error.message.endsWith("is required") || error.message.includes("characters or fewer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Unable to update shipping option" });
  }
});

router.patch("/voucher/:id", async (req, res) => {
  const voucherId = Number(req.params.id);
  if (!Number.isSafeInteger(voucherId) || voucherId < 1) return res.status(400).json({ error: "Invalid voucher ID" });
  try {
    const name = validateText(req.body.name, "Voucher name", 255);
    const description = validateText(req.body.description, "Voucher description");
    const discount = Number(req.body.discount);
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({ error: "Discount must be greater than 0 and at most 100%" });
    }
    const existing = await db.execute({
      sql: "SELECT Voucher_name, Voucher_desc, discount FROM Vouchers WHERE Voucher_id = ?",
      args: [voucherId],
    });
    if (!existing.rows.length) return res.status(404).json({ error: "Voucher not found" });

    const previous = existing.rows[0];
    const changed = name !== String(previous.Voucher_name || "").trim()
      || description !== String(previous.Voucher_desc || "").trim()
      || discount !== Number(previous.discount || 0);
    if (changed) {
      await db.execute({
        sql: `UPDATE Vouchers
              SET Voucher_name = ?, Voucher_desc = ?, discount = ?
              WHERE Voucher_id = ?`,
        args: [name, description, discount, voucherId],
      });
      await logAudit({
        adminId: req.user.adminId,
        type: "voucher_edit",
        description: `Updated voucher ${previous.Voucher_name} (Voucher #${voucherId}) to ${name} with ${discount}% discount`,
      });
    }
    res.json({ voucherId, message: "Voucher updated" });
  } catch (error) {
    if (error.message.endsWith("is required") || error.message.includes("characters or fewer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Unable to update voucher" });
  }
});

async function updateStatus(req, res, kind) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid option ID" });
  if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "Active must be true or false" });

  const isShipping = kind === "shipping";
  const table = isShipping ? "Shipping_options" : "Vouchers";
  const idColumn = isShipping ? "Shipping_id" : "Voucher_id";
  const nameColumn = isShipping ? "Shipping_name" : "Voucher_name";
  const itemType = isShipping ? "shipping option" : "voucher";
  const activeStatusId = req.body.active ? 1 : 2;

  try {
    const existing = await db.execute({
      sql: `SELECT ${nameColumn}, Status_id FROM ${table} WHERE ${idColumn} = ?`,
      args: [id],
    });
    if (!existing.rows.length) return res.status(404).json({ error: `${itemType} not found` });

    const currentStatusId = Number(existing.rows[0].Status_id);
    if (currentStatusId !== activeStatusId) {
      await db.execute({
        sql: `UPDATE ${table} SET Status_id = ? WHERE ${idColumn} = ?`,
        args: [activeStatusId, id],
      });
      await logAudit({
        adminId: req.user.adminId,
        type: `${kind}_status_change`,
        description: `Set ${itemType} ${existing.rows[0][nameColumn]} (#${id}) ${req.body.active ? "active" : "inactive"}`,
      });
    }
    res.json({ id, active: req.body.active });
  } catch (_error) {
    res.status(500).json({ error: `Unable to update ${itemType} status` });
  }
}

router.patch("/shipping/:id/status", (req, res) => updateStatus(req, res, "shipping"));
router.patch("/voucher/:id/status", (req, res) => updateStatus(req, res, "voucher"));

module.exports = router;
