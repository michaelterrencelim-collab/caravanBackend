  const jwt = require("jsonwebtoken");
  const { isCurrentAdminSession } = require("./adminSession");
  const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_testing";

  const requireAuth = (requiredRole = "user") => {
    // 3. Return the actual middleware function Express expects
    return (req, res, next) => {
      const token = req.cookies?.auth; // <- read from cookie
      console.log("auth a");
      if (!token) return res.redirect("/login"); // <- redirect to login if no token
      console.log("auth b");
      jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
        if (err) {
          console.log("auth c");
          return res.status(403).json({ error: "Forbidden: Invalid token" });
        }

        if (decodedUser.role !== requiredRole && decodedUser.role !== "admin" ) {
          console.log("auth d");
          return res
            .status(403)
            .json({ error: "Forbidden: Insufficient permissions" });
        }
        if (decodedUser.role === "admin") {
          try {
            if (!(await isCurrentAdminSession(decodedUser.adminId, decodedUser.sid))) {
              res.clearCookie("auth", { path: "/" });
              return res.status(401).json({ error: "Admin session is no longer active. Please sign in again." });
            }
          } catch (sessionError) {
            console.error("Unable to validate admin session:", sessionError);
            return res.status(503).json({ error: "Unable to validate admin session" });
          }
        }
        req.user = decodedUser;
        next();
      });
    };
  };


    const checkAuth = (requiredRole = "user") => {
    // 3. Return the actual middleware function Express expects
    return (req, res, next) => {
      const token = req.cookies?.auth; // <- read from cookie
      console.log("auth a");
      if (!token) return res.status(401).json({ error: "Not logged in" }); // <- return error if no token
      console.log("auth b");
      jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
        if (err) {
          console.log("auth c");
          return res.status(403).json({ error: "Forbidden: Invalid token" });
        }

        if (decodedUser.role !== requiredRole && decodedUser.role !== "admin" ) {
          console.log("auth d");
          return res
            .status(403)
            .json({ error: "Forbidden: Insufficient permissions" });
        }
        if (decodedUser.role === "admin") {
          try {
            if (!(await isCurrentAdminSession(decodedUser.adminId, decodedUser.sid))) {
              res.clearCookie("auth", { path: "/" });
              return res.status(401).json({ error: "Admin session is no longer active. Please sign in again." });
            }
          } catch (sessionError) {
            console.error("Unable to validate admin session:", sessionError);
            return res.status(503).json({ error: "Unable to validate admin session" });
          }
        }
        req.user = decodedUser;
        next();
      });
    };
  };

  module.exports = { requireAuth, checkAuth };
