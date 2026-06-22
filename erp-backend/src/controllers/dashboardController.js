const Party = require("../models/partyModel");
const Item = require("../models/itemModel");
const Quote = require("../models/quoteModel");
const SalesOrder = require("../models/salesOrderModel");
const DeliveryChallan = require("../models/deliveryChallanModel");
const Route = require("../models/routeModel");
const ledgerService = require("../services/inventoryLedgerService");

exports.getDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }
    const filter = { company: companyId };

    const [
      customersCount,
      vendorsCount,
      agentsCount,
      routesCount,
      marketsCount,
      transportersCount,
      totalItems,
      pendingOrders,
      totalOrders,
      recentOrders,
      quotes,
      challans
    ] = await Promise.all([
      Party.countDocuments({ ...filter, type: "customer" }),
      Party.countDocuments({ ...filter, type: "vendor" }),
      Party.countDocuments({ ...filter, type: "agent" }),
      Route.countDocuments(filter),
      Party.countDocuments({ ...filter, type: "market" }),
      Party.countDocuments({ ...filter, type: "transporter" }),
      Item.countDocuments({ ...filter, status: "active" }),
      SalesOrder.countDocuments({ ...filter, status: { $in: ["pending", "confirmed", "in_production"] } }),
      SalesOrder.find(filter),
      SalesOrder.find(filter).sort({ createdAt: -1 }).limit(5),
      Quote.countDocuments(filter),
      DeliveryChallan.countDocuments(filter)
    ]);

    // Calculate revenue
    const totalRevenue = totalOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const confirmedRevenue = totalOrders
      .filter(o => ["confirmed", "ready", "dispatched", "delivered"].includes(o.status))
      .reduce((sum, o) => sum + (o.total || 0), 0);

    // Production stats
    const inQueue = await SalesOrder.countDocuments({ ...filter, status: "pending" });
    const inProduction = await SalesOrder.countDocuments({ ...filter, status: "in_production" });
    const completedToday = await SalesOrder.countDocuments({
      ...filter,
      status: "delivered",
      updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    // Inventory stats
    let inventorySummary = {};
    try {
      inventorySummary = await ledgerService.getDashboardInventorySummary(companyId);
    } catch (invErr) {
      console.error("Inventory summary fetch failed:", invErr.message);
    }

    res.json({
      stats: {
        totalCustomers: customersCount,
        customersCount,
        vendorsCount,
        agentsCount,
        routesCount,
        marketsCount,
        transportersCount,
        totalItems,
        pendingOrders,
        totalRevenue,
        confirmedRevenue,
        totalQuotes: quotes,
        totalChallans: challans
      },
      recentOrders: recentOrders.map(o => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        items: o.items.map(i => `${i.itemName} - ${i.quantity} pcs`).join(", "),
        status: o.status,
        total: o.total
      })),
      production: {
        inQueue,
        inProduction,
        completedToday
      },
      inventory: inventorySummary
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getSalesReport = async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }
    const filter = { company: companyId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Sales role: only own data
    if (req.user.roleName === "sales") {
      filter.createdBy = req.user.id;
    }

    const orders = await SalesOrder.find(filter).sort({ createdAt: -1 });
    const quotes = await Quote.find(filter).sort({ createdAt: -1 });

    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalQuoteValue = quotes.reduce((sum, q) => sum + (q.total || 0), 0);

    const statusBreakdown = {};
    orders.forEach(o => {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    });

    res.json({
      orders,
      quotes,
      summary: {
        totalOrders: orders.length,
        totalSales,
        totalQuotes: quotes.length,
        totalQuoteValue,
        conversionRate: quotes.length > 0
          ? ((orders.length / quotes.length) * 100).toFixed(1)
          : 0,
        statusBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
