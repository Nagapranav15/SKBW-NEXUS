const mongoose = require("mongoose");

const inventoryLedgerV2Schema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  transactionType: { 
    type: String, 
    required: true, 
    enum: [
      "Purchase",
      "Purchase Inward", 
      "Purchase Receipt",
      "Processing Consumption", 
      "Processing Output", 
      "Production Consumption", 
      "Production Output", 
      "Production Receipt",
      "Bundle Creation", 
      "Sales Dispatch", 
      "Sale",
      "Location Transfer", 
      "Transfer",
      "Stock Adjustment",
      "Adjustment",
      "Job Work Material Out",
      "Job Work Receipt",
      "Reversal",
      "OPENING_BALANCE",
      "Opening Stock"
    ] 
  },
  referenceId: { type: String, required: true, index: true },
  skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuV2', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true, index: true },
  qtyIn: { type: Number, default: 0 },
  qtyOut: { type: Number, default: 0 },
  balanceAfter: { type: Number, required: true },
  batchNumber: { type: String, index: true },
  reels: [{
    reelNumber: String,
    gsm: Number,
    width: Number,
    weight: Number
  }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  remarks: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

inventoryLedgerV2Schema.index({ skuId: 1, locationId: 1, company: 1 });
inventoryLedgerV2Schema.index({ timestamp: -1 });

module.exports = mongoose.model("InventoryLedgerV2", inventoryLedgerV2Schema);
