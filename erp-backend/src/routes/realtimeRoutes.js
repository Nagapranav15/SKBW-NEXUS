const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { handleSseConnection } = require("../utils/realtimeService");

router.get("/stream", (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  let companyId = req.query.companyId;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
      if (!companyId && decoded.company) {
        companyId = decoded.company;
      }
    } catch (_) {
      // Allow connection with explicit companyId even if token expired momentarily
    }
  }

  handleSseConnection(companyId, req, res);
});

router.get("/status", (req, res) => {
  res.json({ status: "active", mode: "server-sent-events" });
});

module.exports = router;
