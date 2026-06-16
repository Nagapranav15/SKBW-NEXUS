const mongoose = require("mongoose");

const inventoryAuditLogSchema = new mongoose.Schema({
  movement_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockMovement",
    default: null
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    default: null
  },
  sectionId: {
    type: String,
    default: null
  },
  quantity_before: {
    type: Number,
    required: true
  },
  quantity_after: {
    type: Number,
    required: true
  },
  change_amount: {
    type: Number,
    required: true
  },
  action_type: {
    type: String,
    enum: ["IN", "OUT", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT", "PRODUCTION_CONSUME", "PRODUCTION_OUTPUT", "OPENING_STOCK", "REMOVAL"],
    required: true
  },
  performed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  reason: {
    type: String,
    default: ""
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

// Indexes for fast audit lookups
inventoryAuditLogSchema.index({ company: 1, createdAt: -1 });
inventoryAuditLogSchema.index({ item: 1, company: 1, createdAt: -1 });
inventoryAuditLogSchema.index({ movement_id: 1 });
inventoryAuditLogSchema.index({ performed_by: 1, company: 1 });
inventoryAuditLogSchema.index({ action_type: 1, company: 1 });

module.exports = mongoose.model("InventoryAuditLog", inventoryAuditLogSchema);
