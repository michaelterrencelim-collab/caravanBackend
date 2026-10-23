const express = require("express");
const app = express.Router();
const crypto = require("crypto");

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");

const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:8100").replace(/\/$/, "");
const allowedFrontendOrigins = new Set([
  new URL(FRONTEND_URL).origin,
  "http://localhost",
  "http://localhost:8100",
  "https://localhost",
  "capacitor://localhost",
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

function getReturnOrigin(value) {
  try {
    const origin = new URL(String(value || FRONTEND_URL)).origin;
    return allowedFrontendOrigins.has(origin) ? origin : FRONTEND_URL;
  } catch {
    return FRONTEND_URL;
  }
}

function clearGoogleState(res) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google/callback" };
  res.clearCookie("google_oauth_state", options);
  res.clearCookie("google_oauth_return", options);
}

const googleClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
);

app.customPath = "/api";

/*
 * STEP 1
 * Send the user to Google
 */
app.get("/auth/google", (req, res) => {
  console.log("Route hit: /auth/google");
  const state = crypto.randomBytes(24).toString("hex");
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60 * 1000,
    path: "/api/auth/google/callback",
  };
  res.cookie("google_oauth_state", state, cookieOptions);
  res.cookie("google_oauth_return", getReturnOrigin(req.query.returnTo), cookieOptions);
  const url = googleClient.generateAuthUrl({
    access_type: "offline",

    scope: ["openid", "email", "profile"],

    prompt: "select_account",
    state,
  });

  res.redirect(url);
});

/*
 * STEP 2
 * Google redirects the user here
 */
app.get("/auth/google/callback", async (req, res) => {
  const frontendOrigin = getReturnOrigin(req.cookies?.google_oauth_return);
  try {
    const { code } = req.query;
    const stateMatches = typeof req.query.state === "string" &&
      req.cookies?.google_oauth_state === req.query.state;
    clearGoogleState(res);

    if (!code || !stateMatches) {
      return res.redirect(`${frontendOrigin}/login?error=google_auth`);
    }

    /*
     * Exchange Google's authorization code
     * for Google tokens.
     */
    const { tokens } = await googleClient.getToken(code);

    /*
     * Verify Google's ID token.
     */
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.redirect(`${frontendOrigin}/login?error=google_auth`);
    }

    const {
      sub: googleId,
      email,
      given_name,
      family_name,
      email_verified,
    } = payload;

    if (!email || !email_verified) {
      return res.redirect(`${frontendOrigin}/login?error=google_auth`);
    }

    /*
     * Find an existing customer.
     */
    const existingUser = await db.execute({
      sql: `
        SELECT *
        FROM Customer
        WHERE Cus_email = ?
      `,
      args: [email],
    });

    let user;

    if (existingUser.rows.length > 0) {
      /*
       * Existing account
       */
      user = existingUser.rows[0];
    } else {
      /*
       * First Google login.
       *
       * Create a normal Customer account.
       */
      const result = await db.execute({
        sql: `
    INSERT INTO Customer (
      first_name,
      last_name,
      Cus_email,
      Cus_password,
      google_id,
      Status
    )
    VALUES (?, ?, ?, ?, ?, 'Enabled')
  `,
        args: [given_name || "", family_name || "", email, null, googleId],
      });

      if (result.affectedRows === 0) {
        return res.redirect(`${frontendOrigin}/login?error=google_auth`);
      }

      /*
       * Get the newly created user.
       */
      const createdUser = await db.execute({
        sql: `
          SELECT *
          FROM Customer
          WHERE Cus_email = ?
        `,
        args: [email],
      });

      user = createdUser.rows[0];
    }

    /*
     * Create YOUR application's JWT.
     */
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

    /*
     * Same cookie system as normal login.
     */
    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    /*
     * Send the user back to your frontend.
     */
    return res.redirect(`${frontendOrigin}/home`);
  } catch (err) {
    console.error("Google login error:", err);
    clearGoogleState(res);
    return res.redirect(`${frontendOrigin}/login?error=google_auth`);
  }
});

module.exports = app;
