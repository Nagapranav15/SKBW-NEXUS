const mongoose = require("mongoose");
const SalesOrderV2 = require("../models/salesOrderV2Model");
const SalesOrder = require("../models/salesOrderModel");
const SkuV2 = require("../models/skuV2Model");
const Party = require("../models/partyModel");
const ActivityLog = require("../models/activityLogModel");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    return null;
  }
};

// Autogenerate next order number (SO-0001, SO-0002...)
exports.getNextSalesOrderNumber = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }

    const companyObjId = toObjectId(companyId);
    const companyQuery = companyObjId ? { $in: [companyObjId, String(companyId)] } : companyId;

    const orders = await SalesOrderV2.find({ company: companyQuery }).select("orderNumber");
    const legacyOrders = await SalesOrder.find({ company: companyQuery }).select("orderNumber");

    const allNumbers = [...orders, ...legacyOrders].map(o => {
      const match = (o.orderNumber || "").match(/SO-?(\d+)/i);
      return match ? parseInt(match[1], 10) : NaN;
    }).filter(n => !isNaN(n));

    const nextCount = allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
    const nextOrderNumber = `SO-${String(nextCount).padStart(4, "0")}`;

    res.json({ nextOrderNumber });
  } catch (err) {
    next(err);
  }
};

// Get all Sales Orders V2
exports.getSalesOrders = async (req, res, next) => {
  try {
    const { companyId, status, search, period } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }

    const companyObjId = toObjectId(companyId);
    const companyQuery = companyObjId ? { $in: [companyObjId, String(companyId)] } : companyId;

    const query = { company: companyQuery, isDeleted: { $ne: true } };

    if (status && status !== "all") {
      query.status = status;
    }

    if (period && period !== "all") {
      const now = new Date();
      let days = 30;
      if (period === "60d") days = 60;
      if (period === "90d") days = 90;
      const cutoffDate = new Date(now.setDate(now.getDate() - days)).toISOString().split("T")[0];
      query.orderDate = { $gte: cutoffDate };
    }

    if (search) {
      const q = search.trim();
      const regexSearch = { $regex: q, $options: "i" };
      query.$or = [
        { orderNumber: regexSearch },
        { customerName: regexSearch },
        { status: regexSearch },
        { "items.itemName": regexSearch },
        { "items.skuCode": regexSearch }
      ];
    }

    const v2Orders = await SalesOrderV2.find(query)
      .populate("customer", "firmName contactName gstin phone city state")
      .populate("items.skuId", "skuCode name category unit gsm width length ruleType pages paperType")
      .sort({ createdAt: -1 });

    // Fallback: Also fetch legacy SalesOrders if any exist and map them seamlessly
    let legacyMapped = [];
    if (!status || status === "all") {
      const legacyQuery = { company: companyQuery };
      if (search) {
        const q = search.trim();
        const regexSearch = { $regex: q, $options: "i" };
        legacyQuery.$or = [
          { orderNumber: regexSearch },
          { customerName: regexSearch }
        ];
      }
      const legacyOrders = await SalesOrder.find(legacyQuery).sort({ createdAt: -1 });
      
      const v2Numbers = new Set(v2Orders.map(o => o.orderNumber));
      legacyMapped = legacyOrders.filter(l => !v2Numbers.has(l.orderNumber)).map(l => ({
        _id: l._id,
        orderNumber: l.orderNumber || `SO-LEGACY-${l._id.toString().slice(-4)}`,
        company: l.company,
        customerName: l.customerName || "Customer",
        orderDate: l.date || (l.createdAt ? new Date(l.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]),
        promisedDate: l.deliveryDate || "",
        items: (l.items || []).map(i => ({
          skuCode: i.itemId || "SKU-LEGACY",
          itemName: i.itemName || "Item",
          quantity: i.quantity || 1,
          unitPrice: i.price || 0,
          totalAmount: i.total || 0,
          dispatchedQty: 0
        })),
        subtotal: l.subtotal || 0,
        totalCgst: (l.tax || 0) / 2,
        totalSgst: (l.tax || 0) / 2,
        totalIgst: 0,
        grandTotal: l.total || 0,
        materialsStatus: "Ready",
        fulfillmentStatus: l.status === "delivered" ? "Fulfilled" : "Not Started",
        status: l.status === "pending" ? "Confirmed" : (l.status === "ready" ? "In Production" : (l.status === "delivered" ? "Delivered" : "Confirmed")),
        isLegacy: true,
        createdAt: l.createdAt
      }));
    }

    const combined = [...v2Orders, ...legacyMapped];
    res.json(combined);
  } catch (err) {
    next(err);
  }
};

// Get Sales Order V2 by ID
exports.getSalesOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let order = await SalesOrderV2.findById(id)
      .populate("customer", "firmName contactName gstin phone email billingAddress shippingAddress state")
      .populate("items.skuId", "skuCode name category unit gsm width length ruleType pages paperType reamWeight bomItems");

    if (!order) {
      // Check legacy model fallback
      const legacy = await SalesOrder.findById(id);
      if (legacy) {
        return res.json({
          _id: legacy._id,
          orderNumber: legacy.orderNumber,
          customerName: legacy.customerName,
          orderDate: legacy.date,
          promisedDate: legacy.deliveryDate,
          items: (legacy.items || []).map(i => ({
            skuCode: i.itemId || "SKU",
            itemName: i.itemName,
            quantity: i.quantity,
            unitPrice: i.price,
            totalAmount: i.total,
            dispatchedQty: 0
          })),
          subtotal: legacy.subtotal,
          grandTotal: legacy.total,
          materialsStatus: "Ready",
          fulfillmentStatus: "Not Started",
          status: "Confirmed",
          isLegacy: true
        });
      }
      return res.status(404).json({ msg: "Sales Order not found" });
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
};

// Create Sales Order V2
exports.createSalesOrder = async (req, res, next) => {
  try {
    const {
      company, customer, customerId, customerName, orderDate, promisedDate, customerPoNumber, customerPoDate,
      facility, internalNotes, billingAddress, shippingAddress, isInterstate, items,
      subtotal, totalCgst, totalSgst, totalIgst, freightCharges, roundOff, grandTotal,
      status, isTemplate
    } = req.body;

    if (!company || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ msg: "Company and at least one item are required" });
    }

    const companyObjId = toObjectId(company);

    // Generate SO order number if not supplied
    let orderNumber = req.body.orderNumber;
    if (!orderNumber) {
      const companyQuery = companyObjId ? { $in: [companyObjId, String(company)] } : company;
      const orders = await SalesOrderV2.find({ company: companyQuery }).select("orderNumber");
      const legacyOrders = await SalesOrder.find({ company: companyQuery }).select("orderNumber");
      const allNumbers = [...orders, ...legacyOrders].map(o => {
        const match = (o.orderNumber || "").match(/SO-?(\d+)/i);
        return match ? parseInt(match[1], 10) : NaN;
      }).filter(n => !isNaN(n));
      const nextCount = allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
      orderNumber = `SO-${String(nextCount).padStart(4, "0")}`;
    }

    // Process line items
    const processedItems = items.map(item => ({
      skuId: item.skuId ? toObjectId(item.skuId) : undefined,
      skuCode: item.skuCode || "SKU-001",
      itemName: item.itemName || "Item",
      category: item.category || "Finished Goods",
      uom: item.uom || "Pcs",
      altUnit: item.altUnit || "",
      altUnitConversion: Number(item.altUnitConversion) || 1,
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      discountPercent: Number(item.discountPercent) || 0,
      taxableAmount: Number(item.taxableAmount) || (Number(item.quantity) * Number(item.unitPrice)),
      hsnCode: item.hsnCode || "",
      gstRate: Number(item.gstRate) || 18,
      cgstAmount: Number(item.cgstAmount) || 0,
      sgstAmount: Number(item.sgstAmount) || 0,
      igstAmount: Number(item.igstAmount) || 0,
      totalAmount: Number(item.totalAmount) || (Number(item.quantity) * Number(item.unitPrice)),
      dispatchedQty: 0
    }));

    const newOrder = new SalesOrderV2({
      orderNumber,
      company: companyObjId,
      customer: customer ? toObjectId(customer) : undefined,
      customerId: customerId || "",
      customerName: customerName || "Customer",
      orderDate: orderDate || new Date().toISOString().split("T")[0],
      promisedDate: promisedDate || "",
      customerPoNumber: customerPoNumber || "",
      customerPoDate: customerPoDate || "",
      facility: facility || "Main Factory",
      internalNotes: internalNotes || "",
      billingAddress: billingAddress || {},
      shippingAddress: shippingAddress || {},
      isInterstate: !!isInterstate,
      items: processedItems,
      subtotal: Number(subtotal) || 0,
      totalCgst: Number(totalCgst) || 0,
      totalSgst: Number(totalSgst) || 0,
      totalIgst: Number(totalIgst) || 0,
      freightCharges: Number(freightCharges) || 0,
      roundOff: Number(roundOff) || 0,
      grandTotal: Number(grandTotal) || 0,
      materialsStatus: "Ready",
      fulfillmentStatus: "Not Started",
      status: status || "Confirmed",
      isTemplate: !!isTemplate,
      createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
    });

    await newOrder.save();

    ActivityLog.create({
      action: "CREATE",
      entityType: "SalesOrderV2",
      entityName: newOrder.orderNumber,
      details: `Sales Order '${newOrder.orderNumber}' for ${newOrder.customerName} (₹${newOrder.grandTotal}) was created.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.status(201).json(newOrder);
  } catch (err) {
    next(err);
  }
};

// Update Sales Order V2
exports.updateSalesOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await SalesOrderV2.findById(id);

    if (!order) {
      return res.status(404).json({ msg: "Sales Order not found" });
    }

    const fields = [
      "customerName", "orderDate", "promisedDate", "customerPoNumber", "customerPoDate",
      "facility", "internalNotes", "billingAddress", "shippingAddress", "isInterstate",
      "subtotal", "totalCgst", "totalSgst", "totalIgst", "freightCharges", "roundOff", "grandTotal",
      "status", "materialsStatus", "fulfillmentStatus"
    ];

    fields.forEach(f => {
      if (req.body[f] !== undefined) order[f] = req.body[f];
    });

    if (req.body.customer) order.customer = toObjectId(req.body.customer);
    if (req.body.items && Array.isArray(req.body.items)) {
      order.items = req.body.items.map(item => ({
        skuId: item.skuId ? toObjectId(item.skuId) : undefined,
        skuCode: item.skuCode || "SKU-001",
        itemName: item.itemName || "Item",
        category: item.category || "Finished Goods",
        uom: item.uom || "Pcs",
        altUnit: item.altUnit || "",
        altUnitConversion: Number(item.altUnitConversion) || 1,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        discountPercent: Number(item.discountPercent) || 0,
        taxableAmount: Number(item.taxableAmount) || 0,
        hsnCode: item.hsnCode || "",
        gstRate: Number(item.gstRate) || 18,
        cgstAmount: Number(item.cgstAmount) || 0,
        sgstAmount: Number(item.sgstAmount) || 0,
        igstAmount: Number(item.igstAmount) || 0,
        totalAmount: Number(item.totalAmount) || 0,
        dispatchedQty: Number(item.dispatchedQty) || 0
      }));
    }

    await order.save();
    res.json(order);
  } catch (err) {
    next(err);
  }
};

// Update Sales Order Status
exports.updateSalesOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, fulfillmentStatus, materialsStatus } = req.body;

    const order = await SalesOrderV2.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Sales Order not found" });
    }

    if (status) order.status = status;
    if (fulfillmentStatus) order.fulfillmentStatus = fulfillmentStatus;
    if (materialsStatus) order.materialsStatus = materialsStatus;

    await order.save();
    res.json({ msg: "Status updated successfully", order });
  } catch (err) {
    next(err);
  }
};

// Makoro Signature Feature: Get Sales Order BOM Explosion & MRP Net Manufacturing Requirements
exports.getSalesOrderBomRequirements = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await SalesOrderV2.findById(id).populate("items.skuId");
    if (!order) {
      return res.status(404).json({ msg: "Sales Order not found" });
    }

    const skuIds = (order.items || []).map(i => i.skuId?._id || i.skuId).filter(Boolean);
    const skus = await SkuV2.find({ _id: { $in: skuIds } });
    const skuMap = new Map(skus.map(s => [s._id.toString(), s]));

    // 1. Calculate Net Products to Manufacture: To Manufacture = Ordered - Live Stock
    const productsToManufacture = (order.items || []).map(item => {
      const sId = item.skuId?._id ? item.skuId._id.toString() : String(item.skuId || "");
      const fullSku = skuMap.get(sId) || item.skuId || {};
      const presentStock = Number(fullSku.presentStock ?? fullSku.openingStock ?? 0);
      const orderedQty = Number(item.quantity || 0);
      const dispatchedQty = Number(item.dispatchedQty || 0);
      const remainingToDeliver = Math.max(0, orderedQty - dispatchedQty);
      const netToManufacture = Math.max(0, remainingToDeliver - presentStock);

      return {
        skuId: sId,
        skuCode: item.skuCode,
        itemName: item.itemName,
        uom: item.uom,
        orderedQty,
        dispatchedQty,
        presentStock,
        netToManufacture,
        bomDefined: !!(fullSku.bomItems && fullSku.bomItems.length > 0)
      };
    });

    // 2. Explode BOM Requirements for Raw Materials
    const rawMaterialReqMap = new Map();

    for (const p of productsToManufacture) {
      const sId = p.skuId;
      const fullSku = skuMap.get(sId);
      if (fullSku && fullSku.bomItems && Array.isArray(fullSku.bomItems)) {
        const qtyMultiplier = p.netToManufacture > 0 ? p.netToManufacture : p.orderedQty;
        for (const bom of fullSku.bomItems) {
          const rmName = bom.name || bom.itemName || "Raw Material";
          const rmUom = bom.uom || bom.unit || "Kg";
          const perUnitQty = Number(bom.qty || bom.quantity || 0);
          const totalRequired = perUnitQty * qtyMultiplier;

          if (!rawMaterialReqMap.has(rmName)) {
            rawMaterialReqMap.set(rmName, {
              materialName: rmName,
              uom: rmUom,
              requiredQty: 0,
              availableStock: Number(bom.inStock || 0),
              shortfallQty: 0,
              status: "Ready"
            });
          }
          const curr = rawMaterialReqMap.get(rmName);
          curr.requiredQty += totalRequired;
        }
      }
    }

    const rawMaterialsList = Array.from(rawMaterialReqMap.values()).map(rm => {
      const shortfall = Math.max(0, rm.requiredQty - rm.availableStock);
      return {
        ...rm,
        shortfallQty: shortfall,
        status: shortfall > 0 ? "Shortfall" : "Ready"
      };
    });

    const hasShortfall = rawMaterialsList.some(rm => rm.shortfallQty > 0);
    const materialsStatus = hasShortfall ? "Shortfall" : "Ready";

    res.json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      promisedDate: order.promisedDate,
      grandTotal: order.grandTotal,
      productsToManufacture,
      rawMaterialsList,
      materialsStatus
    });
  } catch (err) {
    next(err);
  }
};
