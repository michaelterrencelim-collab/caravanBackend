const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { checkAuth } = require("../../imports/token");
const { claimAdminSession, releaseAdminSession, clearAdminSession } = require("../../imports/adminSession");
const { logAudit } = require("../Audit/AuditImport");

const JWT_SECRET = process.env.JWT_SECRET;
const adminRecoveryAttempts = new Map();

app.customPath = "/api";

app.post("/login", async (req, res) => {
  try {
    console.log("A");

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM Admin
        WHERE Admin_email = ?
        AND Admin_password = ?
      `,
      args: [email, password],
    });

    const admins = result.rows;
    if (admins.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const user = admins[0];

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const token = jwt.sign(
      {
        adminId: user.Admin_id,
        email: user.Admin_email,
        role: "admin",
        sid: sessionId,
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    const sessionClaimed = await claimAdminSession(Number(user.Admin_id), sessionId, expiresAt);
    if (!sessionClaimed) {
      return res.status(409).json({
        error: "This admin account is already signed in on another device. Sign out there or wait for the session to expire.",
      });
    }

    // Store JWT in HTTP-only cookie
    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    await logAudit({
      adminId: Number(user.Admin_id),
      type: "login",
      description: `Admin #${user.Admin_id} signed in successfully`,
    });

    // Don't need to send the JWT back to JavaScript anymore
    return res.json({
      role: "admin",
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Server error",
    });
  }
});

app.post("/admin-session-recovery", async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Enter your admin email and password." });

  const attemptKey = req.ip || req.socket.remoteAddress || "unknown";
  const attemptState = adminRecoveryAttempts.get(attemptKey);
  if (attemptState && attemptState.resetAt <= Date.now()) adminRecoveryAttempts.delete(attemptKey);
  const activeAttemptState = adminRecoveryAttempts.get(attemptKey);
  if (activeAttemptState?.count >= 5)
    return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });

  try {
    const result = await db.execute({
      sql: `SELECT Admin_id FROM Admin WHERE LOWER(Admin_email) = LOWER(?) AND Admin_password = ?`,
      args: [email, password],
    });
    const admin = result.rows[0];
    if (!admin) {
      const nextState = activeAttemptState || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
      nextState.count += 1;
      adminRecoveryAttempts.set(attemptKey, nextState);
      return res.status(401).json({ error: "Admin email or password is incorrect." });
    }

    adminRecoveryAttempts.delete(attemptKey);
    const cleared = await clearAdminSession(Number(admin.Admin_id));
    if (req.cookies?.auth) {
      res.clearCookie("auth", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
    if (cleared) {
      await logAudit({
        adminId: Number(admin.Admin_id),
        type: "admin_session_recovery",
        description: `Cleared the active admin session for admin #${admin.Admin_id} after password verification`,
      });
    }
    return res.json({ cleared: cleared > 0, message: cleared ? "The session lock was cleared. You can now log in." : "No session lock was found. You can try logging in." });
  } catch (error) {
    console.error("Admin session recovery error:", error);
    return res.status(500).json({ error: "Unable to clear the admin session. Please try again." });
  }
});

app.post("/logout", checkAuth("admin"), async (req, res) => {
  await releaseAdminSession(Number(req.user.adminId), req.user.sid);
  await logAudit({
    adminId: Number(req.user.adminId),
    type: "logout",
    description: `Admin #${req.user.adminId} signed out`,
  });
  res.clearCookie("auth", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ role: "admin", loggedOut: true });
});

module.exports = app;
