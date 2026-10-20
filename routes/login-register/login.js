const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");
const { checkAuth } = require("../../imports/token");
const { logAudit } = require("../Audit/AuditImport");

const JWT_SECRET = process.env.JWT_SECRET;

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
        FROM Customer
        WHERE Cus_email = ?
        AND Cus_password = ?
      `,
      args: [email, password],
    });

    const users = result.rows;

    const result2 = await db.execute({
      sql: `
        SELECT *
        FROM Admin
        WHERE Admin_email = ?
        AND Admin_password = ?
      `,
      args: [email, password],
    });

    const admins = result2.rows;

    console.log("a");
    console.log(admins, users);

    if (users.length === 0 && admins.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    console.log("attempting");

    const user = admins[0] ? admins[0] : users[0];
    const isAdmin = !!admins[0];

    const token = jwt.sign(
      {
        ...(isAdmin
          ? { adminId: user.Admin_id, email: user.Admin_email }
          : { userId: user.Customer_id, email: user.Cus_email }),
        role: isAdmin ? "admin" : "user",
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    console.log("is admin?", isAdmin);

    // Store JWT in HTTP-only cookie
    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (isAdmin) {
      await logAudit({
        adminId: Number(user.Admin_id),
        type: "login",
        description: `Admin #${user.Admin_id} signed in successfully`,
      });
    }

    // Don't need to send the JWT back to JavaScript anymore
    return res.json({
      role: isAdmin ? "admin" : "user",
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Server error",
    });
  }
});

app.post("/logout", checkAuth("admin"), async (req, res) => {
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
