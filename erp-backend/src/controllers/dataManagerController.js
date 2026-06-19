const Party = require('../models/partyModel');
const Route = require('../models/routeModel');
const Item = require('../models/itemModel');
const Quote = require('../models/quoteModel');
const SalesOrder = require('../models/salesOrderModel');
const DeliveryChallan = require('../models/deliveryChallanModel');
const DispatchCard = require('../models/dispatchCardModel');
const Transaction = require('../models/transactionModel');
const Sequence = require('../models/sequenceModel');
const ActivityLog = require('../models/activityLogModel');
const Inventory = require('../models/inventoryModel');
const InventoryAuditLog = require('../models/inventoryAuditLogModel');
const OpeningStockEntry = require('../models/openingStockEntryModel');
const MfgMovement = require('../models/mfgMovementModel');
const StockMovement = require('../models/stockMovementModel');
const Bom = require('../models/bomModel');
const MinimumStockLevel = require('../models/minimumStockLevelModel');

exports.formatAllData = async (req, res) => {
  try {
    console.log('Database format/wipe request received');

    // Wipe all business collections
    await Promise.all([
      Party.deleteMany({}),
      Route.deleteMany({}),
      Item.deleteMany({}),
      Quote.deleteMany({}),
      SalesOrder.deleteMany({}),
      DeliveryChallan.deleteMany({}),
      DispatchCard.deleteMany({}),
      Transaction.deleteMany({}),
      Sequence.deleteMany({}),
      ActivityLog.deleteMany({}),
      Inventory.deleteMany({}),
      InventoryAuditLog.deleteMany({}),
      OpeningStockEntry.deleteMany({}),
      MfgMovement.deleteMany({}),
      StockMovement.deleteMany({}),
      Bom.deleteMany({}),
      MinimumStockLevel.deleteMany({})
    ]);

    // Create a fresh log for the format action
    await ActivityLog.create({
      action: 'FORMAT',
      entityType: 'database',
      entityName: 'All Data',
      details: 'Wiped/Formatted all database tables (Parties, Routes, Items, Orders, Challans, Inventory, and Logs)',
      performedBy: req.user ? req.user.fullName : 'System',
      company: req.body.companyId || null
    }).catch(err => console.error('Activity log for format failed:', err));

    res.json({ msg: 'Database formatted successfully. All business data has been wiped.' });
  } catch (err) {
    console.error('Error formatting database:', err);
    res.status(500).json({ msg: err.message });
  }
};
