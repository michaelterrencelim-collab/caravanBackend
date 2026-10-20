const crypto = require("crypto");
const db = require("./database");

let invitationTableReady;

async function ensureAdminInvitationTable() {
  if (!invitationTableReady) {
    invitationTableReady = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS Admin_invitations (
          Invitation_id INTEGER PRIMARY KEY AUTOINCREMENT,
          Customer_id INTEGER NOT NULL,
          Customer_email TEXT NOT NULL,
          Invited_by INTEGER NOT NULL,
          Token_hash TEXT NOT NULL UNIQUE,
          Expires_at TEXT NOT NULL,
          Status TEXT NOT NULL DEFAULT 'pending',
          Created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          Responded_at TEXT
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_invitations_pending_customer
        ON Admin_invitations (Customer_id) WHERE Status = 'pending'
      `);
    })().catch((error) => {
      invitationTableReady = null;
      throw error;
    });
  }
  await invitationTableReady;
}

function createInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = { ensureAdminInvitationTable, createInvitationToken, hashInvitationToken };
