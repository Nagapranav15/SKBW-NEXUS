const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
require("../models/roleModel");
const { handleSseConnection } = require("../utils/realtimeService");

// EventSource cannot send headers, so the token may arrive as ?token=. It is verified and the user must
// belong to the requested company (the super admin may subscribe to any company).
router.get("/stream", async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ msg: "No token" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ msg: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select("role companies status").populate("role", "name").lean();
    if (!user || user.status !== "active") return res.status(401).json({ msg: "Account not found or inactive" });

    let companyId = req.query.companyId ? String(req.query.companyId) : undefined;
    if (user.role?.name !== "admin") {
      const allowed = (user.companies || []).map(String);
      if (!companyId && allowed.length === 1) companyId = allowed[0];
      if (!companyId || !allowed.includes(companyId)) return res.status(403).json({ msg: "You do not have access to this company" });
    }

    handleSseConnection(companyId, req, res);
  } catch (err) {
    res.status(500).json({ msg: "Failed to open event stream" });
  }
});

router.get("/status", (req, res) => {
  res.json({ status: "active", mode: "server-sent-events" });
});

module.exports = router;
