const mongoose = require("mongoose");
const SalesOrderV2 = require("../models/salesOrderV2Model");
const SalesOrder = require("../models/salesOrderModel");
const SkuV2 = require("../models/skuV2Model");
const Party = require("../models/partyModel");
const ActivityLog = require("../models/activityLogModel");
const Transaction = require("../models/transactionModel");

const generateTransactionId = (date) => {
  const d = new Date(date || Date.now());
  const ymd = d.toISOString().split("T")[0].replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${ymd}-${rand}`;
};

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

    let v2Orders = [];
    try {
      v2Orders = await SalesOrderV2.find(query)
        .populate("customer", "firmName contactName gstin phone city state")
        .populate("items.skuId", "skuCode name category unit gsm width length ruleType pages paperType")
        .sort({ createdAt: -1 });
    } catch (queryErr) {
      console.error("SalesOrderV2 find error (DB transient failure):", queryErr.message);
      // If it's a connection / server selection error, return empty array with a warning header
      res.setHeader("X-DB-Warning", "SalesOrder query encountered temporary network blip");
      return res.json([]);
    }

    // Fallback: Also fetch legacy SalesOrders if any exist and map them seamlessly
    let legacyMapped = [];
    if (!status || status === "all") {
      try {
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
      } catch (legacyErr) {
        console.warn("Legacy SalesOrder find error:", legacyErr.message);
      }
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
      .populate("items.skuId", "skuCode name category unit gsm width length ruleType pages paperType reamWeight bomItems recipeYieldQty recipeYieldUnit batchYieldQty batchYieldUnit");

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

    // Validate that no line item is inactive or deleted
    const skuIds = items.map(i => i.skuId).filter(Boolean).map(toObjectId);
    if (skuIds.length > 0) {
      const inactiveSkus = await SkuV2.find({
        _id: { $in: skuIds },
        $or: [{ status: "Inactive" }, { isDeleted: true }]
      }).select("skuCode name");

      if (inactiveSkus.length > 0) {
        const names = inactiveSkus.map(s => `${s.skuCode} - ${s.name}`).join(", ");
        return res.status(400).json({
          msg: `The following item(s) are Inactive / Deleted and cannot be billed: ${names}`
        });
      }
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
      gbl: Number(item.gbl) || 0,
      pcsPerGbl: Number(item.pcsPerGbl) || 1,
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

    const orderType = req.body.orderType === "Cash" ? "Cash" : "Credit";
    const orderGrandTotal = Number(grandTotal) || 0;
    const initialPaid = Math.max(0, Number(req.body.paidAmount) || 0);
    const balanceDue = Math.max(0, orderGrandTotal - initialPaid);
    const paymentStatus = balanceDue <= 0 && orderGrandTotal > 0 ? "Paid" : (initialPaid > 0 ? "Partially Paid" : "Unpaid");

    const initialPayments = [];
    if (initialPaid > 0) {
      initialPayments.push({
        paymentId: generateTransactionId(orderDate || new Date()),
        amount: initialPaid,
        paymentMethod: req.body.paymentMethod || "cash",
        date: orderDate ? new Date(orderDate) : new Date(),
        referenceId: req.body.referenceId || "",
        cashLocation: req.body.cashLocation || "",
        chequeNumber: req.body.chequeNumber || "",
        chequeDate: req.body.chequeDate || "",
        bankName: req.body.bankName || "",
        bankBranch: req.body.bankBranch || "",
        chequeStatus: req.body.chequeStatus || "Pending",
        upiProvider: req.body.upiProvider || "",
        accountName: req.body.accountName || "",
        remarks: req.body.remarks || "Initial payment on order creation",
        recordedBy: req.user?.id ? toObjectId(req.user.id) : undefined,
        createdAt: new Date()
      });
    }

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
      transporter: req.body.transporter || "",
      orderType,
      paidAmount: initialPaid,
      balanceDue,
      paymentStatus,
      payments: initialPayments,
      otherCharges: Array.isArray(req.body.otherCharges) ? req.body.otherCharges : [],
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
      grandTotal: orderGrandTotal,
      materialsStatus: "Ready",
      fulfillmentStatus: "Not Started",
      status: status || "Confirmed",
      isTemplate: !!isTemplate,
      createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
    });

    await newOrder.save();

    // If Credit order (or partial payment with remaining balance): reflect unpaid balance in Customer Outstanding
    if (orderType === "Credit" && balanceDue > 0 && (customer || customerId)) {
      try {
        const partyQuery = customer ? { _id: toObjectId(customer) } : { _id: toObjectId(customerId) };
        const custParty = await Party.findOne(partyQuery);
        if (custParty) {
          custParty.outstanding = (custParty.outstanding || 0) + balanceDue;
          custParty.outstandingBalance = (custParty.outstandingBalance || 0) + balanceDue;
          await custParty.save();
        }
      } catch (custErr) {
        console.error("Failed to update customer credit outstanding:", custErr);
      }
    }

    // If initial payment received, record financial transaction
    if (initialPaid > 0 && initialPayments.length > 0) {
      try {
        const pRec = initialPayments[0];
        const financialTx = new Transaction({
          transactionId: pRec.paymentId,
          date: pRec.date,
          type: "credit",
          category: "Sales Order Payment",
          subcategory: pRec.paymentMethod || "cash",
          amount: initialPaid,
          partyId: newOrder.customer ? toObjectId(newOrder.customer) : null,
          partyName: newOrder.customerName || "Customer",
          description: req.body.remarks || `Initial payment received for Sales Order ${newOrder.orderNumber}`,
          paymentMethod: ["cash", "cheque", "upi", "bank_transfer"].includes(pRec.paymentMethod) ? pRec.paymentMethod : "cash",
          referenceId: pRec.referenceId || pRec.chequeNumber || "",
          company: companyObjId,
          createdBy: req.user?.id ? toObjectId(req.user.id) : undefined,
          source: "system",
          source_type: "SALE",
          source_id: newOrder._id,
          payment_status: paymentStatus.toLowerCase()
        });
        await financialTx.save();
      } catch (txnErr) {
        console.error("Failed to record initial payment transaction:", txnErr.message);
      }
    }

    ActivityLog.create({
      action: "CREATE",
      entityType: "SalesOrderV2",
      entityName: newOrder.orderNumber,
      details: `Sales Order '${newOrder.orderNumber}' for ${newOrder.customerName} (₹${newOrder.grandTotal}, Type: ${orderType}) was created.`,
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

    const oldBalanceDue = order.balanceDue !== undefined ? order.balanceDue : (order.orderType === "Credit" ? Math.max(0, (order.grandTotal || 0) - (order.paidAmount || 0)) : 0);
    const oldOrderType = order.orderType || "Credit";

    const fields = [
      "customerName", "orderDate", "promisedDate", "customerPoNumber", "customerPoDate",
      "facility", "transporter", "orderType", "otherCharges", "internalNotes", "billingAddress", "shippingAddress", "isInterstate",
      "subtotal", "totalCgst", "totalSgst", "totalIgst", "freightCharges", "roundOff", "grandTotal",
      "status", "materialsStatus", "fulfillmentStatus"
    ];

    fields.forEach(f => {
      if (req.body[f] !== undefined) order[f] = req.body[f];
    });

    const newGrandTotal = Number(order.grandTotal) || 0;
    const currentPaid = Number(order.paidAmount) || 0;
    const newBalanceDue = Math.max(0, newGrandTotal - currentPaid);
    order.balanceDue = newBalanceDue;
    order.paymentStatus = newBalanceDue <= 0 && newGrandTotal > 0 ? "Paid" : (currentPaid > 0 ? "Partially Paid" : "Unpaid");

    if (req.body.customer) order.customer = toObjectId(req.body.customer);
    if (req.body.items && Array.isArray(req.body.items)) {
      const skuIds = req.body.items.map(i => i.skuId).filter(Boolean).map(toObjectId);
      if (skuIds.length > 0) {
        const inactiveSkus = await SkuV2.find({
          _id: { $in: skuIds },
          $or: [{ status: "Inactive" }, { isDeleted: true }]
        }).select("skuCode name");

        if (inactiveSkus.length > 0) {
          const names = inactiveSkus.map(s => `${s.skuCode} - ${s.name}`).join(", ");
          return res.status(400).json({
            msg: `The following item(s) are Inactive / Deleted and cannot be billed: ${names}`
          });
        }
      }

      order.items = req.body.items.map(item => ({
        skuId: item.skuId ? toObjectId(item.skuId) : undefined,
        skuCode: item.skuCode || "SKU-001",
        itemName: item.itemName || "Item",
        category: item.category || "Finished Goods",
        uom: item.uom || "Pcs",
        altUnit: item.altUnit || "",
        altUnitConversion: Number(item.altUnitConversion) || 1,
        quantity: Number(item.quantity) || 1,
        gbl: Number(item.gbl) || 0,
        pcsPerGbl: Number(item.pcsPerGbl) || 1,
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

    // Adjust customer outstanding balance if balanceDue changed on a Credit order
    if (order.orderType === "Credit" && order.customer) {
      const balanceDiff = newBalanceDue - oldBalanceDue;
      if (balanceDiff !== 0) {
        try {
          const custParty = await Party.findById(order.customer);
          if (custParty) {
            custParty.outstanding = Math.max(0, (custParty.outstanding || 0) + balanceDiff);
            custParty.outstandingBalance = Math.max(0, (custParty.outstandingBalance || 0) + balanceDiff);
            await custParty.save();
          }
        } catch (err2) {
          console.error("Failed to adjust customer balance on order edit:", err2);
        }
      }
    }

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

    const oldStatus = order.status;
    if (status) order.status = status;
    if (fulfillmentStatus) order.fulfillmentStatus = fulfillmentStatus;
    if (materialsStatus) order.materialsStatus = materialsStatus;

    await order.save();

    // If order is cancelled and had unpaid credit balance, deduct from customer outstanding
    if (oldStatus !== "Cancelled" && status === "Cancelled" && order.orderType === "Credit" && (order.balanceDue || 0) > 0 && order.customer) {
      try {
        const custParty = await Party.findById(order.customer);
        if (custParty) {
          custParty.outstanding = Math.max(0, (custParty.outstanding || 0) - (order.balanceDue || 0));
          custParty.outstandingBalance = Math.max(0, (custParty.outstandingBalance || 0) - (order.balanceDue || 0));
          await custParty.save();
        }
      } catch (cancelErr) {
        console.error("Failed to reduce customer outstanding on order cancel:", cancelErr);
      }
    }

    res.json({ msg: "Status updated successfully", order });
  } catch (err) {
    next(err);
  }
};

// Record payment against Sales Order (Full or Partial/Half payment with mode-specific fields)
exports.recordSalesOrderPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      amount,
      paymentMethod = "cash",
      date,
      referenceId,
      cashLocation,
      chequeNumber,
      chequeDate,
      bankName,
      bankBranch,
      chequeStatus,
      upiProvider,
      accountName,
      remarks
    } = req.body;

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ msg: "Payment amount must be a positive number" });
    }

    const order = await SalesOrderV2.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Sales Order not found" });
    }

    const orderTotal = Number(order.grandTotal) || 0;
    const currentPaid = Number(order.paidAmount) || 0;
    const newPaid = currentPaid + payAmount;
    const newBalanceDue = Math.max(0, orderTotal - newPaid);

    order.paidAmount = newPaid;
    order.balanceDue = newBalanceDue;
    order.paymentStatus = newBalanceDue <= 0 && orderTotal > 0 ? "Paid" : (newPaid > 0 ? "Partially Paid" : "Unpaid");

    const validMethod = ["cash", "cheque", "upi", "bank_transfer"].includes(paymentMethod) ? paymentMethod : "cash";

    const paymentRecord = {
      paymentId: generateTransactionId(date || new Date()),
      amount: payAmount,
      paymentMethod: validMethod,
      date: date ? new Date(date) : new Date(),
      referenceId: referenceId || (validMethod === "cheque" ? chequeNumber : "") || "",
      cashLocation: cashLocation || "",
      chequeNumber: chequeNumber || "",
      chequeDate: chequeDate || "",
      bankName: bankName || "",
      bankBranch: bankBranch || "",
      chequeStatus: chequeStatus || "Pending",
      upiProvider: upiProvider || "",
      accountName: accountName || "",
      remarks: remarks || "",
      recordedBy: req.user?.id ? toObjectId(req.user.id) : undefined,
      createdAt: new Date()
    };

    if (!order.payments) order.payments = [];
    order.payments.push(paymentRecord);
    await order.save();

    // Deduct paid amount from Customer's outstanding balance
    let updatedCustomer = null;
    const partyId = order.customer || order.customerId;
    if (partyId) {
      const partyQuery = order.customer ? { _id: toObjectId(order.customer) } : { _id: toObjectId(order.customerId) };
      const customerParty = await Party.findOne(partyQuery);
      if (customerParty) {
        const prevOutstanding = Number(customerParty.outstanding) || 0;
        const prevOutstandingBal = Number(customerParty.outstandingBalance) || 0;
        customerParty.outstanding = Math.max(0, prevOutstanding - payAmount);
        customerParty.outstandingBalance = Math.max(0, prevOutstandingBal - payAmount);
        await customerParty.save();
        updatedCustomer = customerParty;
      }
    }

    // Record in financial Transaction ledger
    try {
      const financialTx = new Transaction({
        transactionId: paymentRecord.paymentId,
        date: paymentRecord.date,
        type: "credit", // Inflow / Customer receipt
        category: "Sales Order Payment",
        subcategory: validMethod,
        amount: payAmount,
        partyId: order.customer ? toObjectId(order.customer) : null,
        partyName: order.customerName || "Customer",
        description: remarks || `Payment received for ${order.orderNumber} via ${validMethod.toUpperCase()}${chequeNumber ? ` (Cheque: ${chequeNumber})` : ''}${referenceId ? ` (Ref: ${referenceId})` : ''}`,
        paymentMethod: validMethod,
        referenceId: referenceId || chequeNumber || "",
        company: order.company,
        createdBy: req.user?.id ? toObjectId(req.user.id) : undefined,
        source: "system",
        source_type: "SALE",
        source_id: order._id,
        payment_status: order.paymentStatus.toLowerCase()
      });
      await financialTx.save();
    } catch (txnErr) {
      console.error("Failed to create financial transaction:", txnErr.message);
    }

    // Activity log
    ActivityLog.create({
      action: "PAYMENT_RECORDED",
      entityType: "SalesOrderV2",
      entityName: order.orderNumber,
      details: `Payment of ₹${payAmount.toLocaleString('en-IN')} recorded for ${order.orderNumber} via ${validMethod}. Remaining balance: ₹${newBalanceDue.toLocaleString('en-IN')}`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: order.company
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({
      msg: "Payment recorded successfully",
      order,
      customer: updatedCustomer,
      payment: paymentRecord
    });
  } catch (err) {
    next(err);
  }
};

// Get payments for a Sales Order
exports.getSalesOrderPayments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await SalesOrderV2.findById(id).select("orderNumber grandTotal paidAmount balanceDue paymentStatus payments customer customerName");
    if (!order) return res.status(404).json({ msg: "Sales Order not found" });
    res.json({
      orderNumber: order.orderNumber,
      grandTotal: order.grandTotal,
      paidAmount: order.paidAmount || 0,
      balanceDue: order.balanceDue !== undefined ? order.balanceDue : Math.max(0, (order.grandTotal || 0) - (order.paidAmount || 0)),
      paymentStatus: order.paymentStatus || "Unpaid",
      payments: order.payments || []
    });
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
