const Item = require("../models/itemModel");
const StockMovement = require("../models/stockMovementModel");
const Inventory = require("../models/inventoryModel");
const InventoryAuditLog = require("../models/inventoryAuditLogModel");

/**
 * Shared Inventory Service — Ledger Architecture
 * All stock operations go through this service to ensure consistency.
 * Every operation: updates Inventory balance + creates StockMovement + creates AuditLog
 */

// ─── INTERNAL: Create audit log entry ───
const createAuditLog = async (data, session) => {
  const opts = session ? { session } : {};
  try {
    await InventoryAuditLog.create([{
      movement_id: data.movement_id || null,
      item: data.item,
      warehouse: data.warehouse || null,
      sectionId: data.sectionId || null,
      quantity_before: data.quantity_before,
      quantity_after: data.quantity_after,
      change_amount: data.change_amount,
      action_type: data.action_type,
      performed_by: data.performed_by || null,
      reason: data.reason || "",
      metadata: data.metadata || {},
      company: data.company
    }], opts);
  } catch (err) {
    console.error("Audit log creation failed:", err.message);
  }
};

// ─── INTERNAL: Update inventory balance atomically ───
const updateBalance = async (itemId, warehouseId, sectionId, quantityChange, companyId, session) => {
  const opts = session ? { session } : {};
  const now = new Date();

  // Try to find and update existing balance
  let balance = await Inventory.findOne({
    item: itemId, warehouse: warehouseId, sectionId, company: companyId
  }, null, opts);

  if (balance) {
    const newQty = balance.quantity + quantityChange;
    if (newQty < 0) {
      throw new Error(`Insufficient stock. Available: ${balance.quantity}, Requested: ${Math.abs(quantityChange)}`);
    }
    balance.quantity = newQty;
    balance.last_updated = now;
    await balance.save(opts);
    return { balance, quantityBefore: balance.quantity - quantityChange, quantityAfter: newQty };
  }

  // Create new balance entry
  if (quantityChange < 0) {
    throw new Error(`Cannot deduct stock — no inventory record exists for this item at this location`);
  }

  balance = await Inventory.create([{
    item: itemId, warehouse: warehouseId, sectionId,
    quantity: quantityChange, company: companyId, last_updated: now
  }], opts);
  balance = balance[0] || balance;

  return { balance, quantityBefore: 0, quantityAfter: quantityChange };
};

/**
 * Validate that all items have sufficient stock for the requested quantities.
 */
const validateStock = async (items, companyId) => {
  const errors = [];
  for (const orderItem of items) {
    if (!orderItem.itemId || !orderItem.quantity || orderItem.quantity <= 0) {
      errors.push({ itemId: orderItem.itemId, itemName: orderItem.itemName || "Unknown", requested: orderItem.quantity, available: 0, reason: "Invalid item or quantity" });
      continue;
    }
    const item = await Item.findById(orderItem.itemId);
    if (!item) {
      errors.push({ itemId: orderItem.itemId, itemName: orderItem.itemName || "Unknown", requested: orderItem.quantity, available: 0, reason: "Item not found" });
      continue;
    }
    if (item.stock < orderItem.quantity) {
      errors.push({ itemId: orderItem.itemId, itemName: item.name, requested: orderItem.quantity, available: item.stock, reason: "Insufficient stock" });
    }
  }
  return { valid: errors.length === 0, errors };
};

/**
 * Deduct stock for a sale or other outbound operation.
 */
const deductStock = async (items, sourceType, sourceId, companyId, userId, session) => {
  const opts = session ? { session } : {};
  const movements = [];

  for (const orderItem of items) {
    if (!orderItem.itemId || !orderItem.quantity || orderItem.quantity <= 0) continue;

    const updated = await Item.findByIdAndUpdate(
      orderItem.itemId,
      { $inc: { stock: -orderItem.quantity } },
      { returnDocument: 'after', ...opts }
    );
    if (!updated) throw new Error(`Item not found: ${orderItem.itemId}`);
    if (updated.stock < 0) {
      throw new Error(`Insufficient stock for ${updated.name}. Available: ${updated.stock + orderItem.quantity}, Requested: ${orderItem.quantity}`);
    }

    const movement = await StockMovement.create([{
      item: orderItem.itemId,
      quantity: -orderItem.quantity,
      movement_type: "OUT",
      source_type: sourceType,
      source_id: sourceId,
      quantity_before: updated.stock + orderItem.quantity,
      quantity_after: updated.stock,
      date: new Date(),
      notes: `${sourceType} deduction: ${orderItem.quantity} units of ${orderItem.itemName || updated.name}`,
      company: companyId,
      createdBy: userId
    }], opts);
    movements.push(movement[0]);

    // Create audit log
    await createAuditLog({
      movement_id: movement[0]._id, item: orderItem.itemId,
      quantity_before: updated.stock + orderItem.quantity, quantity_after: updated.stock,
      change_amount: -orderItem.quantity, action_type: "OUT",
      performed_by: userId, reason: `${sourceType} deduction`, company: companyId
    }, session);
  }
  return movements;
};

/**
 * Add stock for a purchase, return, or other inbound operation.
 */
const addStock = async (items, sourceType, sourceId, companyId, userId, session) => {
  const opts = session ? { session } : {};
  const movements = [];

  for (const orderItem of items) {
    if (!orderItem.itemId || !orderItem.quantity || orderItem.quantity <= 0) continue;

    const item = await Item.findById(orderItem.itemId);
    const stockBefore = item ? item.stock : 0;

    await Item.findByIdAndUpdate(
      orderItem.itemId,
      { $inc: { stock: orderItem.quantity } },
      { returnDocument: 'after', ...opts }
    );

    const movement = await StockMovement.create([{
      item: orderItem.itemId,
      quantity: orderItem.quantity,
      movement_type: "IN",
      source_type: sourceType,
      source_id: sourceId,
      quantity_before: stockBefore,
      quantity_after: stockBefore + orderItem.quantity,
      date: new Date(),
      notes: `${sourceType} addition: ${orderItem.quantity} units of ${orderItem.itemName || ""}`,
      company: companyId,
      createdBy: userId
    }], opts);
    movements.push(movement[0]);

    await createAuditLog({
      movement_id: movement[0]._id, item: orderItem.itemId,
      quantity_before: stockBefore, quantity_after: stockBefore + orderItem.quantity,
      change_amount: orderItem.quantity, action_type: "IN",
      performed_by: userId, reason: `${sourceType} addition`, company: companyId
    }, session);
  }
  return movements;
};

/**
 * Add stock to a specific warehouse/section with proper balance tracking.
 */
const addStockToLocation = async (itemId, warehouseId, sectionId, quantity, companyId, userId, sourceType, sourceId, session) => {
  const opts = session ? { session } : {};
  const qty = Number(quantity);
  if (qty <= 0) throw new Error("Quantity must be greater than 0");

  // Update inventory balance
  const { balance, quantityBefore, quantityAfter } = await updateBalance(
    itemId, warehouseId, sectionId, qty, companyId, session
  );

  // Update Item.stock
  await Item.findByIdAndUpdate(itemId, { $inc: { stock: qty } }, { returnDocument: 'after', ...opts });

  // Create movement
  const movement = await StockMovement.create([{
    item: itemId, quantity: qty, movement_type: "IN",
    source_type: sourceType || "MANUAL", source_id: sourceId || balance._id,
    warehouse: warehouseId, sectionId,
    quantity_before: quantityBefore, quantity_after: quantityAfter,
    date: new Date(), notes: `Stock added: ${qty} units`,
    company: companyId, createdBy: userId
  }], opts);

  // Update balance reference
  balance.last_movement_id = movement[0]._id;
  await balance.save(opts);

  // Audit log
  await createAuditLog({
    movement_id: movement[0]._id, item: itemId, warehouse: warehouseId, sectionId,
    quantity_before: quantityBefore, quantity_after: quantityAfter,
    change_amount: qty, action_type: "IN",
    performed_by: userId, reason: `Manual stock addition`, company: companyId
  }, session);

  return { balance, movement: movement[0] };
};

/**
 * Transfer stock between warehouse/sections.
 */
const transferStockBetweenLocations = async (itemId, fromWarehouse, fromSection, toWarehouse, toSection, quantity, companyId, userId, session) => {
  const opts = session ? { session } : {};
  const qty = Number(quantity);
  if (qty <= 0) throw new Error("Transfer quantity must be greater than 0");

  // Deduct from source
  const source = await updateBalance(itemId, fromWarehouse, fromSection, -qty, companyId, session);

  // Add to destination
  const dest = await updateBalance(itemId, toWarehouse, toSection, qty, companyId, session);

  // Create transfer movement (net zero for Item.stock — location change only)
  const movement = await StockMovement.create([{
    item: itemId, quantity: qty, movement_type: "TRANSFER",
    source_type: "TRANSFER", source_id: null,
    warehouse: toWarehouse, sectionId: toSection,
    from_warehouse: fromWarehouse, from_sectionId: fromSection,
    to_warehouse: toWarehouse, to_sectionId: toSection,
    quantity_before: source.quantityBefore, quantity_after: source.quantityAfter,
    date: new Date(),
    notes: `Transfer: ${qty} units moved between locations`,
    company: companyId, createdBy: userId
  }], opts);

  // Audit logs for both sides
  await createAuditLog({
    movement_id: movement[0]._id, item: itemId, warehouse: fromWarehouse, sectionId: fromSection,
    quantity_before: source.quantityBefore, quantity_after: source.quantityAfter,
    change_amount: -qty, action_type: "TRANSFER_OUT",
    performed_by: userId, reason: "Transfer out", company: companyId
  }, session);

  await createAuditLog({
    movement_id: movement[0]._id, item: itemId, warehouse: toWarehouse, sectionId: toSection,
    quantity_before: dest.quantityBefore, quantity_after: dest.quantityAfter,
    change_amount: qty, action_type: "TRANSFER_IN",
    performed_by: userId, reason: "Transfer in", company: companyId
  }, session);

  return { movement: movement[0], source: source.balance, destination: dest.balance };
};

/**
 * Adjust stock manually (for corrections/inventory counts).
 */
const adjustStock = async (itemId, quantity, reason, companyId, userId, session) => {
  const opts = session ? { session } : {};
  if (quantity === 0) throw new Error("Adjustment quantity cannot be zero");

  const item = await Item.findById(itemId);
  if (!item) throw new Error("Item not found");

  if (quantity < 0 && item.stock + quantity < 0) {
    throw new Error(`Cannot adjust: would result in negative stock. Current: ${item.stock}, Adjustment: ${quantity}`);
  }

  const stockBefore = item.stock;
  await Item.findByIdAndUpdate(itemId, { $inc: { stock: quantity } }, { returnDocument: 'after', ...opts });

  const movement = await StockMovement.create([{
    item: itemId, quantity,
    movement_type: "ADJUSTMENT", source_type: "ADJUSTMENT", source_id: null,
    quantity_before: stockBefore, quantity_after: stockBefore + quantity,
    date: new Date(),
    notes: reason || `Manual adjustment: ${quantity > 0 ? "+" : ""}${quantity}`,
    reason: reason || "",
    company: companyId, createdBy: userId
  }], opts);

  await createAuditLog({
    movement_id: movement[0]._id, item: itemId,
    quantity_before: stockBefore, quantity_after: stockBefore + quantity,
    change_amount: quantity, action_type: "ADJUSTMENT",
    performed_by: userId, reason: reason || "Manual adjustment", company: companyId
  }, session);

  return movement[0];
};

/**
 * Record opening stock — creates movement + balance.
 */
const recordOpeningStock = async (itemId, warehouseId, sectionId, quantity, companyId, userId, notes, session) => {
  const result = await addStockToLocation(
    itemId, warehouseId, sectionId, quantity, companyId, userId, "OPENING_STOCK", null, session
  );

  // Update the movement source_type
  result.movement.source_type = "OPENING_STOCK";
  result.movement.notes = notes || `Opening stock: ${quantity} units`;
  await result.movement.save(session ? { session } : {});

  return result;
};

/**
 * Reverse stock movements for a given source (e.g. when deleting/cancelling an order).
 */
const reverseMovements = async (sourceType, sourceId, companyId, userId, session) => {
  const opts = session ? { session } : {};
  const movements = await StockMovement.find({ source_type: sourceType, source_id: sourceId });

  for (const mov of movements) {
    const item = await Item.findById(mov.item);
    const stockBefore = item ? item.stock : 0;

    await Item.findByIdAndUpdate(
      mov.item,
      { $inc: { stock: -mov.quantity } },
      { returnDocument: 'after', ...opts }
    );

    const reversal = await StockMovement.create([{
      item: mov.item,
      quantity: -mov.quantity,
      movement_type: mov.quantity < 0 ? "IN" : "OUT",
      source_type: sourceType,
      source_id: sourceId,
      quantity_before: stockBefore,
      quantity_after: stockBefore - mov.quantity,
      date: new Date(),
      notes: `Reversal of ${sourceType} movement`,
      company: companyId,
      createdBy: userId
    }], opts);

    await createAuditLog({
      movement_id: reversal[0]._id, item: mov.item,
      quantity_before: stockBefore, quantity_after: stockBefore - mov.quantity,
      change_amount: -mov.quantity, action_type: mov.quantity < 0 ? "IN" : "OUT",
      performed_by: userId, reason: `Reversal of ${sourceType}`, company: companyId
    }, session);
  }
};

/**
 * Get stock movements for a specific item (audit trail).
 */
const getStockMovements = async (itemId, companyId, options = {}) => {
  const filter = { item: itemId };
  if (companyId) filter.company = companyId;
  if (options.startDate || options.endDate) {
    filter.date = {};
    if (options.startDate) filter.date.$gte = new Date(options.startDate);
    if (options.endDate) filter.date.$lte = new Date(options.endDate);
  }
  const movements = await StockMovement.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 100)
    .populate("item", "name itemId primaryUnit")
    .populate("warehouse", "name")
    .populate("from_warehouse", "name")
    .populate("to_warehouse", "name");
  const total = await StockMovement.countDocuments(filter);
  return { movements, total };
};

/**
 * Get all stock movements for a company (for dashboard/reports).
 */
const getAllStockMovements = async (companyId, options = {}) => {
  const filter = {};
  if (companyId) filter.company = companyId;
  if (options.source_type) filter.source_type = options.source_type;
  if (options.movement_type) filter.movement_type = options.movement_type;
  if (options.startDate || options.endDate) {
    filter.date = {};
    if (options.startDate) filter.date.$gte = new Date(options.startDate);
    if (options.endDate) filter.date.$lte = new Date(options.endDate);
  }
  const movements = await StockMovement.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 50)
    .populate("item", "name itemId primaryUnit category")
    .populate("warehouse", "name")
    .populate("from_warehouse", "name")
    .populate("to_warehouse", "name");
  const total = await StockMovement.countDocuments(filter);
  return { movements, total };
};

/**
 * Get audit logs for a company/item.
 */
const getAuditLogs = async (companyId, options = {}) => {
  const filter = { company: companyId };
  if (options.itemId) filter.item = options.itemId;
  if (options.action_type) filter.action_type = options.action_type;
  if (options.startDate || options.endDate) {
    filter.createdAt = {};
    if (options.startDate) filter.createdAt.$gte = new Date(options.startDate);
    if (options.endDate) filter.createdAt.$lte = new Date(options.endDate);
  }
  const logs = await InventoryAuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 50)
    .populate("item", "name itemId")
    .populate("warehouse", "name")
    .populate("performed_by", "fullName username");
  const total = await InventoryAuditLog.countDocuments(filter);
  return { logs, total };
};

module.exports = {
  validateStock,
  deductStock,
  addStock,
  addStockToLocation,
  transferStockBetweenLocations,
  adjustStock,
  recordOpeningStock,
  reverseMovements,
  getStockMovements,
  getAllStockMovements,
  getAuditLogs
};
