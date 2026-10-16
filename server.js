const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = new Set([
  "http://localhost",
  "http://localhost:8100",
  "https://localhost",
  "capacitor://localhost",
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

const routersPath = path.join(__dirname, "routes");

// Recursively load routes
function loadRoutes(directory) {
  fs.readdirSync(directory).forEach((file) => {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    // If it's a folder, search inside it
    // but DON'T add the folder name to the route
    if (stat.isDirectory()) {
      loadRoutes(filePath);
    }

    // If it's a JS file, load it
    else if (file.endsWith(".js")) {
      const router = require(filePath);

      if (typeof router !== "function") {
        console.log(`Skipping non-router module ${filePath}`);
        return;
      }

      const defaultName = path.basename(file, ".js");
      const routePrefix = router.customPath || `/${defaultName}`;

      app.use(routePrefix, router);

      console.log(`Mounted ${filePath} -> ${routePrefix}`);
    }
  });
}

loadRoutes(routersPath);

const filesPath = path.join(__dirname, "/files");

app.use(express.static(filesPath));

app.use((req, res) => {
  res.sendFile(path.join(filesPath, "404.html"));
});
module.exports = app;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
