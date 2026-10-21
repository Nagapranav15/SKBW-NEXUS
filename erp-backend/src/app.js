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

const { attachCompanyScope } = require("./core/companyScope");
const { applySecurity } = require("./core/security");

const app = express();

app.use(compression());

// Security headers, restricted CORS and rate limiting (see core/security.js)
applySecurity(app);

app.use(express.json({ limit: "10mb" }));

// Resolve the user and restrict every database call to the companies they may access
app.use("/api", attachCompanyScope);

// Routes
app.use("/api/v3/stock", require("./core/stock/stockRoutes"));
app.use("/api/v3/conversions", require("./core/conversions/conversionRoutes"));
app.use("/api/v3/recipes", require("./core/recipes/recipeRoutes"));
app.use("/api/v3/sales", require("./core/sales/salesRoutes"));
app.use("/api/v3/reports", require("./core/reports/reportRoutes"));
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