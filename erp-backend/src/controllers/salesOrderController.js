const mongoose = require("mongoose");
const SalesOrder = require("../models/salesOrderModel");
const Transaction = require("../models/transactionModel");
const inventoryService = require("../services/inventoryService");

// Helper: generate transaction ID
const generateTransactionId = (date) => {
  const d = new Date(date);
  const ymd = d.toISOString().split("T")[0].replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${ymd}-${rand}`;
};

// Reusable: auto-create transaction from a financial record
const autoCreateTransaction = async ({ sourceType, sourceId, amount, date, partyName, paymentMode, referenceId, paymentStatus, notes, company, createdBy }, session) => {
  // Prevent duplicates: check if transaction already exists for this source
  const existing = await Transaction.findOne({ source_type: sourceType, source_id: sourceId });
  if (existing) return existing;

  const type = sourceType === "SALE" ? "credit" : "debit";
  const createOpts = session ? { session } : {};

  const txnData = {
    transactionId: generateTransactionId(date || new Date()),
    date: date ? new Date(date) : new Date(),
    type,
    category: sourceType === "SALE" ? "Sales" : sourceType === "PURCHASE" ? "Purchase" : "Expense",
    amount: Number(amount),
    paymentMethod: paymentMode || "cash",
    referenceId: referenceId || "",
    payment_status: paymentStatus || "paid",
    description: notes || `Auto-generated from ${sourceType}`,
    partyName: partyName || "",
    source_type: sourceType,
    source_id: sourceId,
    dataYear: new Date(date || Date.now()).getFullYear(),
    source: "system",
    company,
    createdBy
  };

  const txn = await Transaction.create(session ? [txnData] : txnData, createOpts);
  return session ? txn[0] : txn;
};

exports.getSalesOrders = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (req.query.status) filter.status = req.query.status;

    // Sales role: only see own orders
    if (req.user.roleName === "sales") {
      filter.createdBy = req.user.id;
    }

    const orders = await SalesOrder.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getSalesOrderById = async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Sales order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createSalesOrder = async (req, res) => {
  // Use a session for atomicity when available, fallback to manual rollback
  let session = null;
  let orderCreated = null;
  let stockDeducted = false;
  let transactionCreated = null;

  try {
    const data = { ...req.body, createdBy: req.user.id };

    // Validate items
    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ msg: "Order must have at least one item" });
    }

    for (const item of data.items) {
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ msg: `Quantity must be > 0 for item ${item.itemName || item.itemId}` });
      }
    }

    // Validate payment reference for non-cash modes
    if (data.payment_mode && data.payment_mode !== "cash" && !data.payment_reference_id) {
      return res.status(400).json({ msg: `Payment reference is required for ${data.payment_mode} payments` });
    }

    // Step 1: Validate stock availability
    const stockCheck = await inventoryService.validateStock(data.items, data.company);
    if (!stockCheck.valid) {
      return res.status(400).json({
        msg: "Insufficient stock for one or more items",
        stockErrors: stockCheck.errors
      });
    }

    // Try to use MongoDB session for atomicity
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionErr) {
      // Standalone MongoDB — proceed without session (manual rollback)
      session = null;
    }

    // Step 2: Create the sale order
    if (session) {
      const orders = await SalesOrder.create([data], { session });
      orderCreated = orders[0];
    } else {
      orderCreated = await SalesOrder.create(data);
    }

    // Step 3: Deduct stock
    await inventoryService.deductStock(
      data.items,
      "SALE",
      orderCreated._id,
      data.company,
      req.user.id,
      session
    );
    stockDeducted = true;

    // Step 4: Create transaction record if payment exists
    if (orderCreated.total > 0) {
      transactionCreated = await autoCreateTransaction({
        sourceType: "SALE",
        sourceId: orderCreated._id,
        amount: orderCreated.total,
        date: orderCreated.date,
        partyName: orderCreated.customerName,
        paymentMode: orderCreated.payment_mode,
        referenceId: orderCreated.payment_reference_id,
        paymentStatus: orderCreated.payment_status,
        notes: `Sale: ${orderCreated.orderNumber} - ${orderCreated.customerName}`,
        company: orderCreated.company,
        createdBy: req.user.id
      }, session);
    }

    // Step 5: Commit transaction
    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    res.status(201).json(orderCreated);
  } catch (err) {
    // Rollback
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortErr) {
        console.error("Session abort failed:", abortErr.message);
      }
    } else {
      // Manual rollback for standalone MongoDB
      try {
        if (transactionCreated) {
          await Transaction.findByIdAndDelete(transactionCreated._id);
        }
        if (stockDeducted && orderCreated) {
          await inventoryService.reverseMovements("SALE", orderCreated._id, req.body.company, req.user.id);
        }
        if (orderCreated) {
          await SalesOrder.findByIdAndDelete(orderCreated._id);
        }
      } catch (rollbackErr) {
        console.error("Manual rollback failed:", rollbackErr.message);
      }
    }

    // Return meaningful error
    if (err.message.includes("Insufficient stock")) {
      return res.status(400).json({ msg: err.message });
    }
    res.status(500).json({ msg: err.message });
  }
};

exports.updateSalesOrder = async (req, res) => {
  try {
    const existingOrder = await SalesOrder.findById(req.params.id);
    if (!existingOrder) return res.status(404).json({ msg: "Sales order not found" });

    // Check if items changed — if so, reverse old movements and apply new
    const itemsChanged = req.body.items && JSON.stringify(req.body.items) !== JSON.stringify(existingOrder.items);

    if (itemsChanged) {
      // Validate new stock requirements
      const stockCheck = await inventoryService.validateStock(req.body.items, existingOrder.company);
      
      // Account for stock that will be returned from reversal
      if (!stockCheck.valid) {
        // Re-check: the reversed stock might make it valid
        // Add back the existing order quantities to available stock for comparison
        const adjustedErrors = stockCheck.errors.filter(err => {
          const existingItem = existingOrder.items.find(i => i.itemId === err.itemId);
          const returnedQty = existingItem ? existingItem.quantity : 0;
          return (err.available + returnedQty) < err.requested;
        });

        if (adjustedErrors.length > 0) {
          return res.status(400).json({
            msg: "Insufficient stock for updated items",
            stockErrors: adjustedErrors
          });
        }
      }

      // Reverse old movements
      await inventoryService.reverseMovements("SALE", existingOrder._id, existingOrder.company, req.user.id);
      
      // Apply new deductions
      await inventoryService.deductStock(
        req.body.items,
        "SALE",
        existingOrder._id,
        existingOrder.company,
        req.user.id
      );
    }

    const order = await SalesOrder.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

    // Update linked transaction if exists
    if (order.total > 0) {
      try {
        const existingTxn = await Transaction.findOne({ source_type: "SALE", source_id: order._id });
        if (existingTxn) {
          existingTxn.amount = order.total;
          existingTxn.partyName = order.customerName;
          existingTxn.paymentMethod = order.payment_mode || existingTxn.paymentMethod;
          existingTxn.referenceId = order.payment_reference_id || existingTxn.referenceId;
          existingTxn.payment_status = order.payment_status || existingTxn.payment_status;
          existingTxn.description = `Sale: ${order.orderNumber} - ${order.customerName}`;
          await existingTxn.save();
        }
      } catch (txnErr) {
        console.error("Auto-transaction update failed:", txnErr.message);
      }
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteSalesOrder = async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Sales order not found" });

    // Reverse stock movements
    try {
      await inventoryService.reverseMovements("SALE", order._id, order.company, req.user.id);
    } catch (stockErr) {
      console.error("Stock reversal failed:", stockErr.message);
    }

    // Delete linked transaction
    try {
      await Transaction.deleteOne({ source_type: "SALE", source_id: order._id });
    } catch (txnErr) {
      console.error("Auto-transaction deletion failed:", txnErr.message);
    }

    await SalesOrder.findByIdAndDelete(req.params.id);
    res.json({ msg: "Sales order deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateSalesOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // If cancelling, reverse stock
    if (status === "cancelled") {
      const existingOrder = await SalesOrder.findById(req.params.id);
      if (existingOrder && existingOrder.status !== "cancelled") {
        try {
          await inventoryService.reverseMovements("SALE", existingOrder._id, existingOrder.company, req.user.id);
        } catch (stockErr) {
          console.error("Stock reversal on cancel failed:", stockErr.message);
        }
      }
    }

    const order = await SalesOrder.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after' }
    );
    if (!order) return res.status(404).json({ msg: "Sales order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPendingOrders = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {
      status: { $in: ["pending", "confirmed", "in_production"] }
    };
    if (companyId) filter.company = companyId;

    if (req.user.roleName === "sales") {
      filter.createdBy = req.user.id;
    }

    const orders = await SalesOrder.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Export autoCreateTransaction for reuse in other controllers
exports.autoCreateTransaction = autoCreateTransaction;
