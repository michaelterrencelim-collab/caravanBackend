const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const AUDIT_TYPES = ["created", "updated", "deleted", "sign-in"];

function getAdminId(req) {
  const id = Number(req.user && req.user.userId);
  return Number.isInteger(id) ? id : null;
}

async function logAudit({ adminId = null, type, description }) {
  const actionType = AUDIT_TYPES.includes(type) ? type : "updated";
  try {
    await db.execute({
      sql: `
        INSERT INTO Audit (Admin_id, action_type, description, action_date)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `,
      args: [adminId, actionType, description],
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

module.exports = router;

// module.exports = {
//   AUDIT_TYPES,
//   getAdminId,
//   logAudit,
// };