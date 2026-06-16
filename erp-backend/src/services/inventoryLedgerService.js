const Inventory = require("../models/inventoryModel");
const StockMovement = require("../models/stockMovementModel");
const Item = require("../models/itemModel");
const MinimumStockLevel = require("../models/minimumStockLevelModel");

/**
 * Inventory Ledger Service — Optimized queries for dashboard and reports
 */

/**
 * Get dashboard summary with inventory stats.
 */
const getDashboardInventorySummary = async (companyId) => {
  const filter = {};
  if (companyId) filter.company = companyId;

  const [
    totalItems,
    inventoryEntries,
    recentMovements,
    lowStockItems
  ] = await Promise.all([
    Item.countDocuments({ ...filter, status: "active" }),
    Inventory.find(filter).populate("item", "name itemId category primaryUnit price minStock"),
    StockMovement.find(filter)
      .sort({ date: -1 })
      .limit(5)
      .populate("item", "name itemId")
      .populate("warehouse", "name"),
    getLowStockItems(companyId)
  ]);

  // Aggregate totals
  let totalQuantity = 0;
  let totalValue = 0;
  const categoryBreakdown = {};

  inventoryEntries.forEach(inv => {
    totalQuantity += inv.quantity || 0;
    const price = inv.item?.price || 0;
    totalValue += (inv.quantity || 0) * price;
    const cat = inv.item?.category || "uncategorized";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (inv.quantity || 0);
  });

  return {
    totalItems,
    totalQuantity,
    totalValue,
    lowStockCount: lowStockItems.length,
    outOfStockCount: inventoryEntries.filter(i => (i.quantity || 0) === 0).length,
    categoryBreakdown,
    recentMovements: recentMovements.map(m => ({
      _id: m._id,
      item: m.item,
      quantity: m.quantity,
      movement_type: m.movement_type,
      source_type: m.source_type,
      warehouse: m.warehouse,
      date: m.date,
      notes: m.notes
    })),
    lowStockItems: lowStockItems.slice(0, 10)
  };
};

/**
 * Get items below minimum stock level.
 */
const getLowStockItems = async (companyId) => {
  const filter = { status: "active" };
  if (companyId) filter.company = companyId;

  const items = await Item.find(filter).lean();
  const minLevels = await MinimumStockLevel.find(
    companyId ? { company: companyId, is_active: true } : { is_active: true }
  ).lean();

  const minLevelMap = {};
  minLevels.forEach(ml => { minLevelMap[ml.item.toString()] = ml; });

  const lowStock = [];
  for (const item of items) {
    const minLevel = minLevelMap[item._id.toString()];
    const threshold = minLevel ? minLevel.minimum_quantity : (item.minStock || 0);
    if (threshold > 0 && item.stock <= threshold) {
      lowStock.push({
        _id: item._id,
        itemId: item.itemId,
        name: item.name,
        category: item.category,
        currentStock: item.stock,
        minimumStock: threshold,
        reorderQuantity: minLevel ? minLevel.reorder_quantity : 0,
        deficit: threshold - item.stock,
        isOutOfStock: item.stock === 0
      });
    }
  }

  return lowStock.sort((a, b) => a.currentStock - b.currentStock);
};

/**
 * Get inventory balances with filters.
 */
const getInventoryBalances = async (companyId, options = {}) => {
  const filter = {};
  if (companyId) filter.company = companyId;
  if (options.warehouseId) filter.warehouse = options.warehouseId;
  if (options.itemId) filter.item = options.itemId;

  let query = Inventory.find(filter)
    .populate("item", "name itemId category primaryUnit price stock minStock")
    .populate("warehouse", "name")
    .sort({ updatedAt: -1 });

  if (options.skip) query = query.skip(options.skip);
  if (options.limit) query = query.limit(options.limit);

  const [balances, total] = await Promise.all([
    query.exec(),
    Inventory.countDocuments(filter)
  ]);

  // Apply search filter on populated data if needed
  let filtered = balances;
  if (options.search) {
    const s = options.search.toLowerCase();
    filtered = balances.filter(b =>
      b.item?.name?.toLowerCase().includes(s) ||
      b.item?.itemId?.toLowerCase().includes(s)
    );
  }
  if (options.category) {
    filtered = filtered.filter(b => b.item?.category === options.category);
  }

  return { balances: filtered, total };
};

module.exports = {
  getDashboardInventorySummary,
  getLowStockItems,
  getInventoryBalances
};
