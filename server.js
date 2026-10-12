const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
