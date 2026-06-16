const express = require("express");
const cors = require("cors");
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
const warehouseRoutes = require("./routes/warehouseRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const mfgInventoryRoutes = require("./routes/mfgInventoryRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");

const app = express();

app.use(cors());
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
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/mfg", mfgInventoryRoutes);
app.use("/api/activity-logs", activityLogRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorMiddleware);

module.exports = app;