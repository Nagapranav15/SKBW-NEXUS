const ProductionOrder = require("../models/productionOrderModel");
const SkuV2 = require("../models/skuV2Model");
const mongoose = require("mongoose");

// Helper to generate next Order Number: PR-0001, PR-0002...
const generateNextOrderNumber = async (companyId) => {
  const prefix = "PR-";

  // Find all orders starting with PR- for this company
  const orders = await ProductionOrder.find({
    company: companyId,
    orderNumber: new RegExp(`^${prefix}\\d+`)
  }).select("orderNumber").lean();

  let maxSeq = 0;
  orders.forEach(o => {
    if (o.orderNumber) {
      // Match PR-0001 or PR-2026-0001
      const match = o.orderNumber.match(/^PR-(?:[0-9]{4}-)?([0-9]+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  });

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
};

// GET /api/production-orders
exports.getProductionOrders = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    const filter = { company: companyId };

    if (req.query.status && req.query.status !== "All") {
      filter.status = req.query.status;
    }

    if (req.query.itemType && req.query.itemType !== "All") {
      filter.itemType = req.query.itemType;
    }

    if (req.query.department && req.query.department !== "All") {
      filter.department = req.query.department;
    }

    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { orderNumber: { $regex: q, $options: "i" } },
        { itemName: { $regex: q, $options: "i" } },
        { itemCode: { $regex: q, $options: "i" } },
        { department: { $regex: q, $options: "i" } }
      ];
    }

    const orders = await ProductionOrder.find(filter)
      .sort({ createdAt: -1, orderNumber: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error("Error fetching production orders:", err);
    res.status(500).json({ msg: "Failed to fetch production orders", error: err.message });
  }
};

// GET /api/production-orders/next-number
exports.getNextOrderNumber = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    const nextNumber = await generateNextOrderNumber(companyId);
    res.json({ nextNumber });
  } catch (err) {
    console.error("Error generating next production order number:", err);
    res.status(500).json({ msg: "Failed to generate order number", error: err.message });
  }
};

// GET /api/production-orders/:id
exports.getProductionOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { orderNumber: id };
    }

    const order = await ProductionOrder.findOne(query).lean();
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Error getting production order:", err);
    res.status(500).json({ msg: "Failed to get production order", error: err.message });
  }
};

// POST /api/production-orders
exports.createProductionOrder = async (req, res) => {
  try {
    const companyId = req.body.company || req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    let orderNumber = req.body.orderNumber;
    if (!orderNumber || !orderNumber.trim()) {
      orderNumber = await generateNextOrderNumber(companyId);
    }

    // Check duplicate orderNumber within company
    const existing = await ProductionOrder.findOne({ company: companyId, orderNumber }).lean();
    if (existing) {
      orderNumber = await generateNextOrderNumber(companyId);
    }

    const plannedQty = Number(req.body.plannedQty) || 0;
    const conversionFactor = Number(req.body.conversionFactor) || 1;
    const plannedPcs = Number(req.body.plannedPcs) || (plannedQty * conversionFactor);
    const balanceQty = plannedQty;
    const balancePcs = plannedPcs;

    const newOrder = new ProductionOrder({
      ...req.body,
      orderNumber,
      plannedQty,
      conversionFactor,
      plannedPcs,
      producedQty: 0,
      producedPcs: 0,
      balanceQty,
      balancePcs,
      progress: 0,
      status: req.body.status || "Planned",
      company: companyId,
      createdBy: req.user?._id || req.user?.id
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    console.error("Error creating production order:", err);
    res.status(500).json({ msg: "Failed to create production order", error: err.message });
  }
};

// PUT /api/production-orders/:id
exports.updateProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await ProductionOrder.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating production order:", err);
    res.status(500).json({ msg: "Failed to update production order", error: err.message });
  }
};

// POST /api/production-orders/:id/entries
exports.recordProductionEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    const producedQty = Number(req.body.producedQty) || 0;
    const conversion = order.conversionFactor || 1;
    const isGbl = req.body.producedUom === "GBL" || order.plannedUom === "GBL";
    const producedPcs = isGbl ? producedQty * conversion : producedQty;

    const newCumulativeQty = (order.producedQty || 0) + producedQty;
    const newCumulativePcs = (order.producedPcs || 0) + producedPcs;
    const newBalanceQty = Math.max(0, order.plannedQty - newCumulativeQty);
    const newBalancePcs = Math.max(0, order.plannedPcs - newCumulativePcs);

    const progress = Math.min(100, Math.round((newCumulativePcs / (order.plannedPcs || 1)) * 100));
    const newStatus = progress >= 100 ? "Completed" : "In Production";

    const dateStr = req.body.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const operatorName = req.body.createdBy || req.user?.fullName || "Operator";

    const newEntry = {
      id: `entry-${Date.now()}`,
      date: dateStr,
      shift: req.body.shift || "Day Shift",
      producedQty,
      producedUom: req.body.producedUom || order.plannedUom,
      producedPcs,
      cumulativeQty: newCumulativeQty,
      cumulativePcs: newCumulativePcs,
      remarks: req.body.remarks || "-",
      createdBy: operatorName,
      createdAt: new Date().toISOString()
    };

    order.producedQty = newCumulativeQty;
    order.producedPcs = newCumulativePcs;
    order.balanceQty = newBalanceQty;
    order.balancePcs = newBalancePcs;
    order.progress = progress;
    order.status = newStatus;
    order.productionEntries.push(newEntry);

    if (progress >= 100) {
      const nowTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      order.actualCompletionDate = `${dateStr}, ${nowTime}`;
      order.completedBy = operatorName;

      if (!order.finishedGoodsBatch) {
        order.finishedGoodsBatch = {
          batchNo: `BATCH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
          manufacturingDate: dateStr,
          expiryDate: "-",
          producedQuantity: `${newCumulativeQty} ${order.plannedUom} (${newCumulativePcs.toLocaleString()} PCS)`,
          receivedToLocation: `${order.factory} → Finished Goods - A1`,
          status: "In Stock",
          batchRemarks: "Produced as per plan."
        };
      }

      if (!order.stockUpdates || order.stockUpdates.length === 0) {
        order.stockUpdates = [
          {
            item: order.itemName,
            quantityIn: newCumulativeQty,
            uom: order.plannedUom,
            location: `${order.factory} Finished Goods - A1`
          }
        ];
      }
    }

    await order.save();
    res.json(order);
  } catch (err) {
    console.error("Error recording production entry:", err);
    res.status(500).json({ msg: "Failed to record production entry", error: err.message });
  }
};

// PATCH /api/production-orders/:id/complete
exports.completeProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    const todayStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const nowTimeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const completedBy = req.body.completedBy || req.user?.fullName || "Operator";

    order.producedQty = order.plannedQty;
    order.producedPcs = order.plannedPcs;
    order.balanceQty = 0;
    order.balancePcs = 0;
    order.progress = 100;
    order.status = "Completed";
    order.actualCompletionDate = `${todayStr}, ${nowTimeStr}`;
    order.completedBy = completedBy;

    if (!order.finishedGoodsBatch) {
      order.finishedGoodsBatch = {
        batchNo: `BATCH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        manufacturingDate: todayStr,
        expiryDate: "-",
        producedQuantity: `${order.plannedQty} ${order.plannedUom} (${order.plannedPcs.toLocaleString()} PCS)`,
        receivedToLocation: `${order.factory} → Finished Goods - A1`,
        status: "In Stock",
        batchRemarks: "Produced as per plan."
      };
    }

    if (!order.stockUpdates || order.stockUpdates.length === 0) {
      order.stockUpdates = [
        {
          item: order.itemName,
          quantityIn: order.plannedQty,
          uom: order.plannedUom,
          location: `${order.factory} Finished Goods - A1`
        }
      ];
    }

    await order.save();
    res.json(order);
  } catch (err) {
    console.error("Error completing production order:", err);
    res.status(500).json({ msg: "Failed to complete production order", error: err.message });
  }
};

// DELETE /api/production-orders/:id
exports.deleteProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ProductionOrder.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ msg: "Production order not found" });
    }
    res.json({ msg: "Production order deleted successfully", id });
  } catch (err) {
    console.error("Error deleting production order:", err);
    res.status(500).json({ msg: "Failed to delete production order", error: err.message });
  }
};
