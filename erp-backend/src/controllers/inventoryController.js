const Inventory = require("../models/inventoryModel");
const inventoryService = require("../services/inventoryService");
const ledgerService = require("../services/inventoryLedgerService");
const MinimumStockLevel = require("../models/minimumStockLevelModel");
const OpeningStockEntry = require("../models/openingStockEntryModel");

// ─── EXISTING ENDPOINTS (preserved) ───

exports.getInventorySummary = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;

    const inventory = await Inventory.find(filter)
      .populate("item", "name itemId category primaryUnit price stock minStock")
      .populate("warehouse", "name");

    const itemMap = {};
    inventory.forEach(inv => {
      const key = inv.item?._id?.toString();
      if (!key) return;
      if (!itemMap[key]) {
        itemMap[key] = { item: inv.item, totalQuantity: 0, locations: [] };
      }
      itemMap[key].totalQuantity += inv.quantity;
      itemMap[key].locations.push({
        _id: inv._id, warehouse: inv.warehouse, sectionId: inv.sectionId,
        quantity: inv.quantity, reserved_quantity: inv.reserved_quantity,
        available_quantity: inv.available_quantity
      });
    });

    res.json(Object.values(itemMap));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getInventoryByWarehouse = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const inventory = await Inventory.find({ warehouse: warehouseId })
      .populate("item", "name itemId category primaryUnit price stock minStock");

    const sectionMap = {};
    inventory.forEach(inv => {
      if (!sectionMap[inv.sectionId]) sectionMap[inv.sectionId] = [];
      sectionMap[inv.sectionId].push({
        _id: inv._id, item: inv.item, quantity: inv.quantity,
        reserved_quantity: inv.reserved_quantity, available_quantity: inv.available_quantity
      });
    });

    res.json(sectionMap);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getInventoryByItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const inventory = await Inventory.find({ item: itemId })
      .populate("warehouse", "name");
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.addStock = async (req, res) => {
  try {
    const { item, warehouse, sectionId, quantity, company } = req.body;
    const qty = Number(quantity);
    if (qty <= 0) return res.status(400).json({ msg: "Quantity must be greater than 0" });

    const result = await inventoryService.addStockToLocation(
      item, warehouse, sectionId, qty, company, req.user.id, "MANUAL", null
    );

    const populated = await Inventory.findById(result.balance._id)
      .populate("item", "name itemId category primaryUnit")
      .populate("warehouse", "name");

    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Stock entry already exists for this item at this location" });
    }
    res.status(500).json({ msg: err.message });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const existingInv = await Inventory.findById(req.params.id);
    if (!existingInv) return res.status(404).json({ msg: "Inventory entry not found" });

    const newQty = Number(req.body.quantity);
    const diff = newQty - existingInv.quantity;

    if (newQty < 0) return res.status(400).json({ msg: "Stock quantity cannot be negative" });

    if (diff !== 0) {
      await inventoryService.adjustStock(
        existingInv.item, diff,
        `Inventory update: ${existingInv.quantity} → ${newQty}`,
        existingInv.company, req.user.id
      );
    }

    existingInv.quantity = newQty;
    existingInv.last_updated = new Date();
    await existingInv.save();

    const inv = await Inventory.findById(req.params.id)
      .populate("item", "name itemId category primaryUnit")
      .populate("warehouse", "name");
    res.json(inv);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.removeStock = async (req, res) => {
  try {
    const inv = await Inventory.findById(req.params.id);
    if (!inv) return res.status(404).json({ msg: "Inventory entry not found" });

    if (inv.quantity > 0) {
      await inventoryService.adjustStock(
        inv.item, -inv.quantity,
        `Inventory entry removed from warehouse`,
        inv.company, req.user.id
      );
    }

    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ msg: "Stock entry removed" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.transferStock = async (req, res) => {
  try {
    const { targetWarehouse, targetSectionId, quantity } = req.body;
    const source = await Inventory.findById(req.params.id);
    if (!source) return res.status(404).json({ msg: "Source stock entry not found" });

    const transferQty = Number(quantity);
    if (transferQty <= 0) return res.status(400).json({ msg: "Transfer quantity must be greater than 0" });
    if (transferQty > source.quantity) return res.status(400).json({ msg: "Transfer quantity exceeds available stock" });

    await inventoryService.transferStockBetweenLocations(
      source.item, source.warehouse, source.sectionId,
      targetWarehouse, targetSectionId, transferQty,
      source.company, req.user.id
    );

    // Clean up empty source
    const updated = await Inventory.findById(source._id);
    if (updated && updated.quantity <= 0) {
      await Inventory.findByIdAndDelete(source._id);
    }

    res.json({ msg: "Stock transferred successfully" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getStockMovements = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { companyId, limit, skip, startDate, endDate } = req.query;
    const result = await inventoryService.getStockMovements(itemId, companyId, {
      limit: Number(limit) || 50, skip: Number(skip) || 0, startDate, endDate
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAllStockMovements = async (req, res) => {
  try {
    const { companyId, source_type, movement_type, limit, skip, startDate, endDate } = req.query;
    const result = await inventoryService.getAllStockMovements(companyId, {
      source_type, movement_type,
      limit: Number(limit) || 50, skip: Number(skip) || 0, startDate, endDate
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─── NEW ENDPOINTS ───

exports.getInventoryBalances = async (req, res) => {
  try {
    const { companyId, warehouseId, itemId, search, category, limit, skip } = req.query;
    const result = await ledgerService.getInventoryBalances(companyId, {
      warehouseId, itemId, search, category,
      limit: Number(limit) || 50, skip: Number(skip) || 0
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const { companyId } = req.query;
    const summary = await ledgerService.getDashboardInventorySummary(companyId);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getLowStock = async (req, res) => {
  try {
    const { companyId } = req.query;
    const items = await ledgerService.getLowStockItems(companyId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { companyId, itemId, action_type, limit, skip, startDate, endDate } = req.query;
    const result = await inventoryService.getAuditLogs(companyId, {
      itemId, action_type,
      limit: Number(limit) || 50, skip: Number(skip) || 0, startDate, endDate
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.recordOpeningStock = async (req, res) => {
  try {
    const { item, warehouse, sectionId, quantity, company, notes } = req.body;
    const qty = Number(quantity);
    if (qty <= 0) return res.status(400).json({ msg: "Quantity must be greater than 0" });

    const result = await inventoryService.recordOpeningStock(
      item, warehouse, sectionId, qty, company, req.user.id, notes
    );

    // Create opening stock entry record
    await OpeningStockEntry.create({
      item, warehouse, sectionId, quantity: qty,
      notes: notes || "", movement_id: result.movement._id,
      company, createdBy: req.user.id
    });

    res.status(201).json({ msg: "Opening stock recorded", balance: result.balance });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkAdjustment = async (req, res) => {
  try {
    const { adjustments, company } = req.body;
    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({ msg: "Adjustments array is required" });
    }

    const results = [];
    const errors = [];

    for (const adj of adjustments) {
      try {
        const movement = await inventoryService.adjustStock(
          adj.itemId, Number(adj.quantity), adj.reason || "Bulk adjustment",
          company, req.user.id
        );
        results.push({ itemId: adj.itemId, status: "success", movement_id: movement._id });
      } catch (err) {
        errors.push({ itemId: adj.itemId, status: "failed", error: err.message });
      }
    }

    res.json({ results, errors, totalProcessed: results.length, totalFailed: errors.length });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.setMinimumStockLevel = async (req, res) => {
  try {
    const { item, company, minimum_quantity, reorder_quantity } = req.body;

    const level = await MinimumStockLevel.findOneAndUpdate(
      { item, company },
      { minimum_quantity: Number(minimum_quantity) || 0, reorder_quantity: Number(reorder_quantity) || 0, is_active: true },
      { new: true, upsert: true }
    );

    res.json(level);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getMinimumStockLevels = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = { is_active: true };
    if (companyId) filter.company = companyId;

    const levels = await MinimumStockLevel.find(filter)
      .populate("item", "name itemId category stock primaryUnit");
    res.json(levels);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// CSV Export
exports.exportInventory = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;

    const inventory = await Inventory.find(filter)
      .populate("item", "name itemId category primaryUnit price stock")
      .populate("warehouse", "name");

    const rows = inventory.map(inv => ({
      itemId: inv.item?.itemId || "",
      itemName: inv.item?.name || "",
      category: inv.item?.category || "",
      unit: inv.item?.primaryUnit || "",
      warehouse: inv.warehouse?.name || "",
      section: inv.sectionId || "",
      quantity: inv.quantity || 0,
      reserved: inv.reserved_quantity || 0,
      available: inv.available_quantity || 0
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// CSV Import
exports.importInventory = async (req, res) => {
  try {
    const { data, company } = req.body;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ msg: "Data array is required" });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        if (!row.itemId || !row.warehouseId || !row.sectionId || !row.quantity) {
          errors.push({ row: i + 1, error: "Missing required fields (itemId, warehouseId, sectionId, quantity)" });
          continue;
        }

        await inventoryService.addStockToLocation(
          row.itemId, row.warehouseId, row.sectionId,
          Number(row.quantity), company, req.user.id,
          row.sourceType || "MANUAL", null
        );
        results.push({ row: i + 1, status: "success" });
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({ results, errors, totalProcessed: results.length, totalFailed: errors.length });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
