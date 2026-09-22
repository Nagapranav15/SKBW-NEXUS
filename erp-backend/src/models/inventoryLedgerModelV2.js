const mongoose = require("mongoose");

const inventoryLedgerSchema = new mongoose.Schema({
  transactionNumber: { type: String, required: true, unique: true, index: true },
  transactionType: { 
    type: String, 
    required: true, 
    enum: [
      "Purchase", 
      "Purchase Receipt",
      "Processing", 
      "Production", 
      "Production Consumption",
      "Production Receipt",
      "Transfer", 
      "Location Transfer",
      "Adjustment", 
      "Stock Adjustment",
      "Sale", 
      "Sales Dispatch", 
      "Job Work Material Out",
      "Job Work Receipt",
      "Reversal",
      "Opening Balance", 
      "Opening Stock"
    ],
    index: true
  },
  skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuV2', required: true, index: true },
  quantity: { type: Number, required: true, min: 0.001 },
  unit: { type: String, required: true },
  direction: { type: String, required: true, enum: ["IN", "OUT"], index: true },
  referenceType: { type: String, required: true }, 
  referenceId: { type: String, required: true, index: true },
  batchNumber: { type: String, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true }, 
  floorId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true, index: true }, 
  remarks: { type: String, default: "" },
  reels: [{
    reelNumber: { type: String },
    gsm: { type: Number },
    width: { type: Number },
    weight: { type: Number }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, required: true, enum: ["Posted", "Pending", "Cancelled"], default: "Posted" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model("InventoryLedger", inventoryLedgerSchema);
