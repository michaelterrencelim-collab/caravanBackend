const express = require("express");
const db = require("../imports/database");
const { ensureAdminInvitationTable, hashInvitationToken } = require("../imports/adminInvitations");
const { logAudit } = require("./Audit/AuditImport");

const router = express.Router();
router.customPath = "/api/admin-invitations";

function validToken(token) {
  return /^[a-f0-9]{64}$/i.test(String(token || ""));
}

router.get("/:token", async (req, res) => {
  if (!validToken(req.params.token)) return res.status(404).json({ error: "Invitation not found or expired" });
  try {
    await ensureAdminInvitationTable();
    const result = await db.execute({
      sql: `SELECT c.first_name, c.last_name, i.Expires_at
            FROM Admin_invitations i
            JOIN Customer c ON c.Customer_id = i.Customer_id
            WHERE i.Token_hash = ? AND i.Status = 'pending'
              AND LOWER(c.Cus_email) = LOWER(i.Customer_email)
              AND julianday(i.Expires_at) > julianday('now')`,
      args: [hashInvitationToken(req.params.token)],
    });
    if (!result.rows.length) return res.status(410).json({ error: "This invitation is no longer available" });
    const row = result.rows[0];
    res.setHeader("Cache-Control", "no-store");
    res.json({
      customerName: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Customer",
      expiresAt: row.Expires_at,
    });
  } catch (error) {
    console.error("Unable to load admin invitation:", error);
    res.status(500).json({ error: "Unable to load invitation" });
  }
});

router.post("/:token/respond", async (req, res) => {
  if (!validToken(req.params.token)) return res.status(404).json({ error: "Invitation not found or expired" });
  const decision = String(req.body.decision || "").toLowerCase();
  if (!['accept', 'decline'].includes(decision))
    return res.status(400).json({ error: "Choose whether to accept or decline this invitation" });

  let transaction;
  try {
    await ensureAdminInvitationTable();
    transaction = await db.transaction("write");
    const tokenHash = hashInvitationToken(req.params.token);
    const invitationResult = await transaction.execute({
      sql: `SELECT i.Invitation_id, i.Customer_id, i.Customer_email, i.Invited_by,
                   c.first_name, c.last_name, c.Cus_email, c.Cus_password,
                   c.Status AS Customer_status
            FROM Admin_invitations i
            JOIN Customer c ON c.Customer_id = i.Customer_id
            WHERE i.Token_hash = ? AND i.Status = 'pending'
              AND LOWER(c.Cus_email) = LOWER(i.Customer_email)
              AND julianday(i.Expires_at) > julianday('now')`,
      args: [tokenHash],
    });
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      await transaction.rollback();
      transaction = null;
      return res.status(410).json({ error: "This invitation is no longer available" });
    }

    if (decision === "decline") {
      await transaction.execute({
        sql: "UPDATE Admin_invitations SET Status = 'declined', Responded_at = CURRENT_TIMESTAMP WHERE Invitation_id = ? AND Status = 'pending'",
        args: [invitation.Invitation_id],
      });
      await transaction.commit();
      transaction = null;
      return res.json({ status: "declined", message: "You declined the Caravan admin invitation." });
    }

    if (!["enabled", "active"].includes(String(invitation.Customer_status || "enabled").trim().toLowerCase())) {
      await transaction.execute({
        sql: "UPDATE Admin_invitations SET Status = 'customer_disabled' WHERE Invitation_id = ? AND Status = 'pending'",
        args: [invitation.Invitation_id],
      });
      await transaction.commit();
      transaction = null;
      return res.status(409).json({ error: "This customer account is no longer enabled" });
    }
    if (!invitation.Cus_password) {
      await transaction.rollback();
      transaction = null;
      return res.status(409).json({ error: "This customer account does not have a password and cannot sign in to the admin portal" });
    }

    const duplicateAdmin = await transaction.execute({
      sql: "SELECT Admin_id FROM Admin WHERE LOWER(Admin_email) = LOWER(?)",
      args: [invitation.Cus_email],
    });
    if (duplicateAdmin.rows.length) {
      await transaction.execute({
        sql: "UPDATE Admin_invitations SET Status = 'already_admin', Responded_at = CURRENT_TIMESTAMP WHERE Invitation_id = ? AND Status = 'pending'",
        args: [invitation.Invitation_id],
      });
      await transaction.commit();
      transaction = null;
      return res.status(409).json({ error: "This account already has admin access" });
    }

    const insertResult = await transaction.execute({
      sql: `INSERT INTO Admin
              (Admin_id, Admin_email, Admin_password, First_name, Last_name, Account_status, role_id)
            SELECT COALESCE(MAX(Admin_id), 0) + 1, ?, ?, ?, ?, 'Enabled', 2
            FROM Admin`,
      args: [invitation.Cus_email, invitation.Cus_password, invitation.first_name, invitation.last_name],
    });
    if (!insertResult.rowsAffected) throw new Error("Could not create the admin account");

    const updateResult = await transaction.execute({
      sql: "UPDATE Admin_invitations SET Status = 'accepted', Responded_at = CURRENT_TIMESTAMP WHERE Invitation_id = ? AND Status = 'pending'",
      args: [invitation.Invitation_id],
    });
    if (!updateResult.rowsAffected) throw new Error("Invitation was already answered");
    await transaction.commit();
    transaction = null;

    const customerName = [invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || `Customer #${invitation.Customer_id}`;
    await logAudit({
      adminId: invitation.Invited_by,
      type: "admin_invitation",
      description: `Added customer #${invitation.Customer_id} (${customerName}) as an admin with role #2 after accepting the invitation`,
    });
    res.json({ status: "accepted", message: "Invitation accepted. You can now sign in to Caravan Admin Management with your existing account credentials." });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be closed */ }
    }
    console.error("Unable to respond to admin invitation:", error);
    res.status(500).json({ error: "Unable to process this invitation" });
  }
});

module.exports = router;
