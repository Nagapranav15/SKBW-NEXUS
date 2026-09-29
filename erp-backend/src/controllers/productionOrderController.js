const ProductionOrder = require("../models/productionOrderModel");
const SkuV2 = require("../models/skuV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const Sequence = require("../models/sequenceModel");
const mongoose = require("mongoose");

// Helper to resolve warehouse location hierarchy (Factory -> Floor -> Zone -> Location)
const getHierarchy = async (locationId, companyId) => {
  if (!locationId && !companyId) return {};
  const companyObjId = mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : null;

  let loc = null;
  if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
    loc = await WarehouseLocationV2.findById(locationId).lean();
  }
  if (!loc && locationId && companyObjId) {
    loc = await WarehouseLocationV2.findOne({
      company: companyObjId,
      name: { $regex: new RegExp(`^${String(locationId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
    }).lean();
  }
  if (!loc && companyObjId) {
    loc = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" }).lean()
      || await WarehouseLocationV2.findOne({ company: companyObjId }).lean();
  }
  if (!loc) return {};

  const chain = [loc];
  let curr = loc;
  while (curr && curr.parentId) {
    let parent = await WarehouseLocationV2.findById(curr.parentId).lean();
    if (!parent) break;
    chain.unshift(parent);
    curr = parent;
  }

  const factoryNode = chain.find(n => n.level === "Factory");
  const floorNode = chain.find(n => n.level === "Floor");
  const zoneNode = chain.find(n => n.level === "Zone");
  const storageNode = chain.find(n => n.level === "Storage Location");

  const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || loc._id);
  const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
  const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
  const resolvedLocId = storageNode ? storageNode._id : loc._id;

  return { warehouseId, floorId, zoneId, locationId: resolvedLocId };
};

const cleanedCompanies = new Set();

// Cleanup ghost ledger entries for uncompleted production orders where 0 was produced
const cleanupGhostProductionLedgers = async (companyId) => {
  try {
    if (cleanedCompanies.has(String(companyId))) return;
    const filter = {
      status: { $nin: ["Completed"] },
      $or: [{ producedQty: 0 }, { producedQty: { $exists: false } }]
    };
    if (companyId) filter.company = companyId;

    const unproducedOrders = await ProductionOrder.find(filter).select("orderNumber company").lean();
    if (unproducedOrders.length > 0) {
      const orderNumbers = unproducedOrders.map(o => o.orderNumber);
      const exists = await InventoryLedger.exists({
        referenceType: "ProductionOrder",
        referenceId: { $in: orderNumbers }
      });
      if (exists) {
        await InventoryLedger.deleteMany({
          referenceType: "ProductionOrder",
          referenceId: { $in: orderNumbers }
        });
      }
    }
    cleanedCompanies.add(String(companyId));
  } catch (e) {
    console.error("Error cleaning ghost production ledgers:", e);
  }
};

// Dynamically synchronize prepared production order stock in Item Stock & Inventory (InventoryLedger).
// Only actual PREPARED (produced) stock is recorded into on-hand inventory!
// While planned or in-production with 0 produced, it only reserves the place (does not record directly).
const syncProductionOrderLedger = async (order) => {
  try {
    if (!order || !order.company) return;
    const companyObjId = order.company;

    // Clean up previous ledger entries for this production order to avoid stale or duplicate postings
    await InventoryLedger.deleteMany({
      referenceType: "ProductionOrder",
      referenceId: order.orderNumber,
      company: companyObjId
    });

    const isCompleted = order.status === "Completed";
    const producedQty = Number(order.producedQty) || 0;
    // Dynamic prepared stock: only actual produced quantity, or full planned quantity if order is Completed
    const qtyIn = isCompleted ? (producedQty > 0 ? producedQty : Number(order.plannedQty)) : producedQty;

    // If 0 stock has been prepared, DO NOT record on-hand stock directly into the ledger!
    // It remains in "In Production" / reserved place.
    if (qtyIn <= 0) {
      return;
    }

    const ledgerDocs = [];

    // 1. Finished Product Receipt (IN) - ONLY for actual prepared stock
    if (order.itemId || order.itemCode || order.itemName) {
      let sku = null;
      if (order.itemId && mongoose.Types.ObjectId.isValid(order.itemId)) {
        sku = await SkuV2.findById(order.itemId).lean();
      }
      if (!sku) {
        sku = await SkuV2.findOne({
          company: companyObjId,
          $or: [
            { skuCode: order.itemCode },
            { name: order.itemName }
          ]
        }).lean();
      }

      if (sku) {
        const outputLocId = order.outputLocationId || order.locationId || order.outputLocation || order.factory || order.factoryId || sku.initialLocationId || sku.defaultLocation;
        const h = await getHierarchy(outputLocId, companyObjId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        if (h.locationId) {
          ledgerDocs.push({
            transactionNumber,
            transactionType: "Production Receipt",
            skuId: sku._id,
            quantity: qtyIn,
            unit: order.plannedUom || sku.unit || "Pcs",
            direction: "IN",
            referenceType: "ProductionOrder",
            referenceId: order.orderNumber,
            batchNumber: order.finishedGoodsBatch?.batchNo || order.orderNumber,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Prepared under Production Order ${order.orderNumber} (${order.itemName}) [${isCompleted ? 'Completed' : 'Partial'}]`,
            createdBy: order.createdBy,
            company: companyObjId,
            status: "Posted"
          });
        }
      }
    }

    // 2. BOM Materials Consumption (OUT) - Proportional to actual prepared stock
    if (order.bomItems && Array.isArray(order.bomItems) && order.bomItems.length > 0) {
      const progressRatio = isCompleted ? 1 : Math.min(1, qtyIn / (Number(order.plannedQty) || 1));

      for (const m of order.bomItems) {
        const fullReq = Number(m.totalRequired) || Number(m.qtyPerBatch) || 0;
        const consumedQty = Math.round(fullReq * progressRatio * 1000) / 1000;
        if (consumedQty <= 0) continue;

        let matSku = null;
        if (m.skuId && mongoose.Types.ObjectId.isValid(m.skuId)) {
          matSku = await SkuV2.findById(m.skuId).lean();
        }
        if (!matSku) {
          matSku = await SkuV2.findOne({
            company: companyObjId,
            $or: [
              { skuCode: m.code },
              { name: m.component }
            ]
          }).lean();
        }

        if (matSku) {
          const matLocId = m.locationId || m.sourceLocation || matSku.initialLocationId || matSku.defaultLocation || order.outputLocationId || order.locationId;
          const h = await getHierarchy(matLocId, companyObjId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          if (h.locationId) {
            ledgerDocs.push({
              transactionNumber,
              transactionType: "Production Consumption",
              skuId: matSku._id,
              quantity: consumedQty,
              unit: m.uom || matSku.unit || "Pcs",
              direction: "OUT",
              referenceType: "ProductionOrder",
              referenceId: order.orderNumber,
              batchNumber: m.batchNumber || order.orderNumber,
              warehouseId: h.warehouseId,
              floorId: h.floorId,
              zoneId: h.zoneId,
              locationId: h.locationId,
              remarks: `Consumed for Production Order ${order.orderNumber} (${order.itemName})`,
              createdBy: order.createdBy,
              company: companyObjId,
              status: "Posted"
            });
          }
        }
      }
    }

    if (ledgerDocs.length > 0) {
      await InventoryLedger.insertMany(ledgerDocs, { ordered: false });
    }
  } catch (err) {
    console.error("Error syncing production order stock updates to InventoryLedger:", err);
  }
};

// Helper to generate next Order Number: PO-001, PO-002... up to 100,000+
const generateNextOrderNumber = async (companyId) => {
  const prefix = "PO-";

  // Find all orders starting with PO- or legacy PR- for this company
  const orders = await ProductionOrder.find({
    company: companyId,
    orderNumber: /^(?:PO|PR)-\d+/
  }).select("orderNumber").lean();

  let maxSeq = 0;
  orders.forEach(o => {
    if (o.orderNumber) {
      // Match PO-001, PO-100000, PR-0001, etc.
      const match = o.orderNumber.match(/^(?:PO|PR)-(?:[0-9]{4}-)?([0-9]+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  });

  const nextSeq = maxSeq + 1;
  // Standard format PO-001, seamlessly accommodates > 1 lakh orders (e.g. PO-100000)
  const padLength = Math.max(3, String(nextSeq).length);
  return `${prefix}${String(nextSeq).padStart(padLength, "0")}`;
};

// GET /api/production-orders
exports.getProductionOrders = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    // Auto-heal ghost ledger entries for uncompleted orders with 0 produced
    await cleanupGhostProductionLedgers(companyId);

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

    let queryExec = ProductionOrder.find(filter).sort({ createdAt: -1, orderNumber: -1 });
    if (req.query.light === "true" || req.query.light === true) {
      queryExec = queryExec.select("orderNumber itemId itemName itemCode plannedQty plannedUom plannedPcs producedQty producedPcs status progress costSummary bomItems outputLocation factory");
    }

    const orders = await queryExec.lean();

    // Ensure all order numbers display standard PO- format
    const normalized = orders.map(o => {
      if (o.orderNumber && o.orderNumber.startsWith("PR-")) {
        const match = o.orderNumber.match(/^PR-(\d+)$/);
        const newNo = match 
          ? `PO-${String(parseInt(match[1], 10)).padStart(Math.max(3, String(parseInt(match[1], 10)).length), "0")}`
          : o.orderNumber.replace(/^PR-/, "PO-");
        return { ...o, orderNumber: newNo };
      }
      return o;
    });

    res.json(normalized);
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
      const altId = id.startsWith("PO-") ? id.replace(/^PO-0*/, "PR-0") : id.replace(/^PR-0*/, "PO-0");
      query = { $or: [{ orderNumber: id }, { orderNumber: altId }] };
    }

    const order = await ProductionOrder.findOne(query).lean();
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    if (order.orderNumber && order.orderNumber.startsWith("PR-")) {
      const match = order.orderNumber.match(/^PR-(\d+)$/);
      order.orderNumber = match
        ? `PO-${String(parseInt(match[1], 10)).padStart(Math.max(3, String(parseInt(match[1], 10)).length), "0")}`
        : order.orderNumber.replace(/^PR-/, "PO-");
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

    // Calculate dynamic costSummary if not fully provided
    let costSummary = req.body.costSummary || {};
    const bomItems = req.body.bomItems || [];
    const matCost = bomItems.reduce((acc, it) => acc + (Number(it.amount) || ((Number(it.totalRequired || it.qtyPerBatch || 0)) * (Number(it.rate) || 0))), 0);
    const addCosts = req.body.additionalCosts || [];
    const addCost = addCosts.reduce((acc, it) => acc + (Number(it.amount || it.totalAmount) || 0), 0);
    const totalCost = Number(costSummary.totalProductionCost) > 0 ? Number(costSummary.totalProductionCost) : (matCost + addCost);
    const costPerGbl = plannedQty > 0 ? (totalCost / plannedQty) : 0;
    const costPerPiece = plannedPcs > 0 ? (totalCost / plannedPcs) : 0;

    costSummary = {
      materialCost: Number(costSummary.materialCost) || matCost,
      additionalCost: Number(costSummary.additionalCost) || addCost,
      totalProductionCost: totalCost,
      costPerGbl: Number(costSummary.costPerGbl) || Math.round(costPerGbl * 100) / 100,
      costPerPiece: Number(costSummary.costPerPiece) || Math.round(costPerPiece * 100) / 100,
      ...costSummary
    };

    const newOrder = new ProductionOrder({
      ...req.body,
      costSummary,
      orderNumber,
      plannedQty,
      conversionFactor,
      plannedPcs,
      producedQty: Number(req.body.producedQty) || 0,
      producedPcs: Number(req.body.producedPcs) || 0,
      balanceQty,
      balancePcs,
      progress: req.body.progress || 0,
      status: req.body.status || "Planned",
      company: companyId,
      createdBy: req.user?._id || req.user?.id
    });

    if (!newOrder.stockUpdates || newOrder.stockUpdates.length === 0) {
      newOrder.stockUpdates = [
        {
          item: newOrder.itemName,
          quantityIn: newOrder.plannedQty,
          uom: newOrder.plannedUom,
          location: newOrder.outputLocation || `${newOrder.factory || 'Main Factory'}`
        }
      ];
    }

    await newOrder.save();

    // Dynamically sync prepared stock in Item Stock & Inventory (only records if actually prepared/completed)
    await syncProductionOrderLedger(newOrder);

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

    // Dynamically sync prepared stock in Item Stock & Inventory
    await syncProductionOrderLedger(updated);

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

    // Dynamically sync prepared stock in Item Stock & Inventory according to production
    await syncProductionOrderLedger(order);

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
          location: order.outputLocation || `${order.factory} Finished Goods - A1`
        }
      ];
    }

    await order.save();

    // Directly reflect completed production order in Item Stock & Inventory
    await syncProductionOrderLedger(order);

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

    // Clean up corresponding inventory ledger entries
    await InventoryLedger.deleteMany({
      referenceType: "ProductionOrder",
      referenceId: deleted.orderNumber
    });

    res.json({ msg: "Production order deleted successfully", id });
  } catch (err) {
    console.error("Error deleting production order:", err);
    res.status(500).json({ msg: "Failed to delete production order", error: err.message });
  }
};

// POST /api/production-orders/material-rates
// Calculates 3 costing modes: 1. Avg of purchase batch orders, 2. FIFO (earliest active batch), 3. Custom/Standard
exports.getMaterialRates = async (req, res) => {
  try {
    const { companyId, skuIds } = req.body;
    if (!companyId || !Array.isArray(skuIds) || skuIds.length === 0) {
      return res.json({ rates: {} });
    }

    const companyObjId = new mongoose.Types.ObjectId(companyId);
    const validSkuIds = skuIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const skus = await SkuV2.find({
      _id: { $in: validSkuIds },
      company: companyObjId
    }).lean();

    const rates = {};

    for (const sku of skus) {
      const skuIdStr = String(sku._id);

      // 1. Fetch active batches with onHand stock (sorted chronologically by firstInDate)
      const batchBalances = await InventoryLedger.aggregate([
        { $match: { skuId: sku._id, company: companyObjId, status: { $ne: "Cancelled" } } },
        {
          $group: {
            _id: { batchNumber: "$batchNumber", locationId: "$locationId" },
            qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
            qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } },
            firstInDate: { $min: { $cond: [{ $eq: ["$direction", "IN"] }, "$createdAt", null] } }
          }
        },
        {
          $project: {
            batchNumber: "$_id.batchNumber",
            locationId: "$_id.locationId",
            onHand: { $subtract: ["$qtyIn", "$qtyOut"] },
            firstInDate: 1
          }
        },
        { $match: { onHand: { $gt: 0.0001 } } },
        { $sort: { firstInDate: 1 } }
      ]);

      // 2. Fetch purchase invoices for this SKU
      const invoices = await PurchaseInvoiceV2.find({
        company: companyObjId,
        "items.skuId": sku._id,
        status: { $ne: "Cancelled" }
      }).select("invoiceNumber invoiceDate partyName items createdAt").sort({ invoiceDate: 1, createdAt: 1 }).lean();

      const batchPriceMap = new Map();
      const allPurchasedItems = [];

      invoices.forEach(inv => {
        (inv.items || []).forEach(it => {
          if (String(it.skuId) === skuIdStr) {
            const price = Number(it.purchasePrice) || Number(it.ratePerKg) || 0;
            const qty = Number(it.quantity) || 0;
            if (it.lotNumber) batchPriceMap.set(it.lotNumber, price);
            if (it.batchNumber) batchPriceMap.set(it.batchNumber, price);
            if (inv.invoiceNumber) batchPriceMap.set(inv.invoiceNumber, price);
            allPurchasedItems.push({
              price,
              quantity: qty,
              date: inv.invoiceDate || inv.createdAt,
              invoiceNumber: inv.invoiceNumber,
              vendor: inv.partyName
            });
          }
        });
      });

      const standardRate = Number(sku.purchasePrice || (sku).costPrice || (sku).rate || 0);

      // FIFO: Pick the unit price of the earliest active batch
      let fifoRate = 0;
      let fifoBatchInfo = null;

      if (batchBalances.length > 0) {
        const earliestBatch = batchBalances[0];
        const bNum = earliestBatch.batchNumber;
        const bRate = (bNum && batchPriceMap.has(bNum)) ? batchPriceMap.get(bNum) : 0;
        fifoRate = bRate > 0 ? bRate : (allPurchasedItems[0]?.price || standardRate);
        fifoBatchInfo = {
          batchNumber: bNum || 'LOT-01',
          date: earliestBatch.firstInDate ? new Date(earliestBatch.firstInDate).toLocaleDateString('en-GB') : undefined,
          remainingQty: Math.round(earliestBatch.onHand * 100) / 100,
          rate: fifoRate
        };
      } else if (allPurchasedItems.length > 0) {
        fifoRate = allPurchasedItems[0].price;
        fifoBatchInfo = {
          batchNumber: allPurchasedItems[0].invoiceNumber || 'PO-INV',
          date: allPurchasedItems[0].date ? new Date(allPurchasedItems[0].date).toLocaleDateString('en-GB') : undefined,
          remainingQty: allPurchasedItems[0].quantity,
          rate: fifoRate
        };
      } else {
        fifoRate = standardRate;
      }

      // Average of Purchase Batch Orders (Weighted Average)
      let avgRate = 0;
      let totalBatchQty = 0;
      let totalBatchValue = 0;

      if (batchBalances.length > 0) {
        batchBalances.forEach(b => {
          const bRate = (b.batchNumber && batchPriceMap.has(b.batchNumber)) 
            ? batchPriceMap.get(b.batchNumber) 
            : (allPurchasedItems.find(it => it.invoiceNumber === b.batchNumber)?.price || standardRate);
          if (bRate > 0) {
            totalBatchQty += b.onHand;
            totalBatchValue += (b.onHand * bRate);
          }
        });
        avgRate = totalBatchQty > 0 ? Math.round((totalBatchValue / totalBatchQty) * 100) / 100 : standardRate;
      } else if (allPurchasedItems.length > 0) {
        const sumQty = allPurchasedItems.reduce((s, it) => s + it.quantity, 0);
        const sumVal = allPurchasedItems.reduce((s, it) => s + (it.quantity * it.price), 0);
        avgRate = sumQty > 0 ? Math.round((sumVal / sumQty) * 100) / 100 : standardRate;
      } else {
        avgRate = standardRate;
      }

      // 3. Fetch last-used rate from most recent production order that used this SKU as a material
      let lastProductionRate = 0;
      try {
        const lastPO = await ProductionOrder.findOne({
          company: companyObjId,
          "bomItems.skuId": sku._id.toString(),
          status: { $ne: "Cancelled" }
        }).sort({ createdAt: -1 }).select("bomItems orderNumber createdAt").lean();

        if (lastPO && Array.isArray(lastPO.bomItems)) {
          const matchedBomItem = lastPO.bomItems.find(b =>
            b.skuId && String(b.skuId) === skuIdStr
          );
          if (matchedBomItem) {
            lastProductionRate = Number(matchedBomItem.rate) || 0;
          }
        }
      } catch (e) {
        // Non-critical: silently ignore, fallback to 0
      }

      rates[skuIdStr] = {
        skuId: skuIdStr,
        skuCode: sku.skuCode,
        skuName: sku.name,
        standardRate,
        avgRate: avgRate > 0 ? avgRate : standardRate,
        fifoRate: fifoRate > 0 ? fifoRate : standardRate,
        fifoBatchInfo,
        batchCount: batchBalances.length || allPurchasedItems.length,
        lastProductionRate: lastProductionRate > 0 ? lastProductionRate : 0
      };
    }

    res.json({ rates });
  } catch (err) {
    console.error("Error computing material rates:", err);
    res.status(500).json({ msg: "Failed to compute material rates", error: err.message });
  }
};
