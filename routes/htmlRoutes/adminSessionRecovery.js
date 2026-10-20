const express = require("express");
const path = require("path");

const router = express.Router();
const filesPath = path.join(__dirname, "../../files");
router.customPath = "/admin-session-recovery";

router.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(filesPath, "AdminSessionRecovery.html"));
});

router.use(express.static(filesPath));

module.exports = router;
