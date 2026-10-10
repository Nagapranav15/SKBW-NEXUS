const express = require("express");
const cors = require("cors");
const compression = require("compression");
const errorMiddleware = require("./middlewares/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const companyRoutes = require("./routes/companyRoutes");
const partyRoutes = require("./routes/partyRoutes");
const routeRoutes = require('./routes/routeRoutes');
const itemRoutes = require("./routes/itemRoutes");
const quoteRoutes = require("./routes/quoteRoutes");
const salesOrderRoutes = require("./routes/salesOrderRoutes");
const deliveryChallanRoutes = require("./routes/deliveryChallanRoutes");
const dispatchCardRoutes = require("./routes/dispatchCardRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const mfgInventoryV2Routes = require("./routes/mfgInventoryV2Routes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const dataManagerRoutes = require("./routes/dataManagerRoutes");
const productionOrderRoutes = require("./routes/productionOrderRoutes");
const realtimeRoutes = require("./routes/realtimeRoutes");
const salesInvoiceRoutes = require("./routes/salesInvoiceRoutes");

const app = express();

app.use(compression());

// Open CORS configuration for all origins and preview domains
app.use(cors({
  origin: (origin, callback) => {
    // Allow all incoming origins (https://www.skbw.in, https://skbw.in, *.vercel.app, etc.)
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
}));

// Enable pre-flight OPTIONS response for all routes (Express 5 compatible)
app.options(/(.*)/, cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/parties", partyRoutes);
app.use('/api/routes', routeRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/sales-orders", salesOrderRoutes);
app.use("/api/delivery-challans", deliveryChallanRoutes);
app.use("/api/dispatch-cards", dispatchCardRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/v2", mfgInventoryV2Routes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/data-manager", dataManagerRoutes);
app.use("/api/production-orders", productionOrderRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/v2/realtime", realtimeRoutes);
app.use("/api/invoices", salesInvoiceRoutes);
app.use("/api/sales-invoices", salesInvoiceRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static frontend dist if available (for monolithic / fullstack server deployments)
const path = require("path");
const fs = require("fs");
const distPath = path.join(__dirname, "../../dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) next();
    });
  });
}

// Error handling
app.use(errorMiddleware);

module.exports = app;