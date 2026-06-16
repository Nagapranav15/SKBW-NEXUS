const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  quantity: {
    type: Number,
    required: true
    // Positive for IN, negative for OUT
  },
  movement_type: {
    type: String,
    enum: ["IN", "OUT", "ADJUSTMENT", "TRANSFER", "PRODUCTION_CONSUME", "PRODUCTION_OUTPUT"],
    required: true
  },
  source_type: {
    type: String,
    enum: ["SALE", "PURCHASE", "RETURN", "ADJUSTMENT", "TRANSFER", "MANUAL", "OPENING_STOCK", "PRODUCTION"],
    required: true
  },
  source_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Location tracking
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    default: null
  },
  sectionId: {
    type: String,
    default: null
  },
  // Transfer tracking: source and destination
  from_warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    default: null
  },
  from_sectionId: {
    type: String,
    default: null
  },
  to_warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    default: null
  },
  to_sectionId: {
    type: String,
    default: null
  },
  // Audit: before/after quantities
  quantity_before: {
    type: Number,
    default: null
  },
  quantity_after: {
    type: Number,
    default: null
  },
  // Idempotency: prevents duplicate movement application
  idempotency_key: {
    type: String,
    default: null
  },
  date: {
    type: Date,
    default: () => new Date()
  },
  notes: {
    type: String,
    default: ""
  },
  reason: {
    type: String,
    default: ""
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

stockMovementSchema.index({ item: 1, company: 1 });
stockMovementSchema.index({ source_type: 1, source_id: 1 });
stockMovementSchema.index({ company: 1, date: -1 });
stockMovementSchema.index({ company: 1, movement_type: 1 });
stockMovementSchema.index({ warehouse: 1, company: 1 });
stockMovementSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
