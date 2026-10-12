const db = require("../../imports/database");
const DEFAULT_ACTION_TYPE = "action";
function getAdminId(req) {
  const id = Number(req.user && req.user.userId);
  return Number.isInteger(id) ? id : null;
}

async function logAudit({ adminId = null, type = DEFAULT_ACTION_TYPE, description }) {
  try {
    await db.execute({
      sql: `
        INSERT INTO Audit (Admin_id, action_type, description, action_date)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `,
      args: [adminId, type, description],
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

module.exports = { getAdminId, logAudit };