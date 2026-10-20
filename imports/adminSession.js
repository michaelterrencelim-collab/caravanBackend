const db = require("./database");

let tableReady;

async function ensureSessionTable() {
  if (!tableReady) {
    tableReady = db.execute(`
      CREATE TABLE IF NOT EXISTS Admin_sessions (
        Admin_id INTEGER PRIMARY KEY,
        Session_id TEXT NOT NULL,
        Expires_at TEXT NOT NULL
      )
    `).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function claimAdminSession(adminId, sessionId, expiresAt) {
  await ensureSessionTable();
  const result = await db.execute({
    sql: `INSERT INTO Admin_sessions (Admin_id, Session_id, Expires_at)
          VALUES (?, ?, ?)
          ON CONFLICT(Admin_id) DO UPDATE SET
            Session_id = excluded.Session_id,
            Expires_at = excluded.Expires_at
          WHERE julianday(Admin_sessions.Expires_at) <= julianday('now')`,
    args: [adminId, sessionId, expiresAt],
  });
  return Number(result.rowsAffected || 0) > 0;
}

async function isCurrentAdminSession(adminId, sessionId) {
  if (!adminId || !sessionId) return false;
  await ensureSessionTable();
  const result = await db.execute({
    sql: `SELECT 1 FROM Admin_sessions
          WHERE Admin_id = ? AND Session_id = ? AND julianday(Expires_at) > julianday('now')`,
    args: [adminId, sessionId],
  });
  return result.rows.length > 0;
}

async function releaseAdminSession(adminId, sessionId) {
  if (!adminId || !sessionId) return;
  await ensureSessionTable();
  await db.execute({
    sql: "DELETE FROM Admin_sessions WHERE Admin_id = ? AND Session_id = ?",
    args: [adminId, sessionId],
  });
}

async function clearAdminSession(adminId) {
  if (!adminId) return 0;
  await ensureSessionTable();
  const result = await db.execute({
    sql: "DELETE FROM Admin_sessions WHERE Admin_id = ?",
    args: [adminId],
  });
  return Number(result.rowsAffected || 0);
}

module.exports = { claimAdminSession, isCurrentAdminSession, releaseAdminSession, clearAdminSession };
