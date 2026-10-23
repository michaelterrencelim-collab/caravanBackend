const express = require("express");
const app = express.Router();
const db = require("../../imports/database");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
app.customPath = "/api";

app.post("/register", async (req, res) => {
  try {

    const { firstName, lastName, email, password } = req.body;
    const first_name = firstName;
    const last_name = lastName;
    if (!first_name || !last_name || !email || !password) {
      console.log("missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (password.length > 255) {
      console.log("password too long");
      return res.status(400).json({ error: "Password too long" });
    }

    if (first_name.length > 100 || last_name.length > 100) {
      console.log("name too long");
      return res.status(400).json({ error: "Name too long" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log("invalid email format");
      return res.status(400).json({ error: "Invalid email format" });
    }
    /*INSERT INTO Customer (
    Customer_id,
    first_name,
    last_name,
    Cus_email,
    Cus_phone,
    Cus_birthdate,
    Cus_password,
    Status
) */
    //TODO: add into

    const existingUser = await db.execute({
  sql: `
    SELECT Customer_id
    FROM Customer
    WHERE Cus_email = ?
  `,
  args: [email],
});

if (existingUser.rows.length > 0) {
  return res.status(409).json({
    error: "Email is already registered",
  });
}
    const result = await db.execute({
      sql: `
        INSERT INTO Customer (first_name, last_name, Cus_email, Cus_password, Status)
        VALUES (?, ?, ?, ?, 'Enabled')
      `,
      args: [first_name, last_name, email, password],
    });
    if (result.affectedRows === 0) {
      return res.status(500).json({ error: "Server error" });
    }
    const user = await db.execute({
      sql: `
        SELECT *
        FROM Customer
        WHERE Cus_email = ?
        AND Cus_password = ?
      `,
      args: [email, password],
    });

    const token = jwt.sign(
      {
        userId: user.Customer_id,
        email: user.Cus_email,
        role: "user",
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      login: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
module.exports = app;
