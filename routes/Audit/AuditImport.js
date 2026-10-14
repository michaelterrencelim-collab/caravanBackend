const db = require("../../imports/database");
const DEFAULT_ACTION_TYPE = "action";
const ADMIN_ID_KEYS = ["userId", "adminId", "Admin_id", "admin_id", "id", "sub"];

function getAdminId(req) {
  const user = (req && req.user) || {};
  for (const key of ADMIN_ID_KEYS) {
    const id = Number(user[key]);
    if (user[key] !== undefined && user[key] !== null && Number.isInteger(id)) return id;
  }
  console.warn("getAdminId: no admin id found in req.user. Keys present:", Object.keys(user));
  return null;
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