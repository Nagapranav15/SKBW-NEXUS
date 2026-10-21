/**
 * Phase 2 stock models. These are the ONLY place stock quantity and value are stored for the new core.
 *
 *  StockLedger   append-only record of every stock movement (single source of truth)
 *  ItemCost      company-wide quantity, value and moving-average cost per item (derived from the ledger,
 *                updated in the same transaction as each ledger entry)
 *  StockBalance  quantity per item per location (same rule)
 *  Reel          individually tracked paper reels
 *
 * Items themselves still live in SkuV2 for now; itemId references SkuV2._id.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const TXN_TYPES = [
  "OPENING", "RECEIPT", "RETURN_IN",
  "ISSUE", "SALE_OUT", "RETURN_OUT",
  "ADJUSTMENT_IN", "ADJUSTMENT_OUT",
  "TRANSFER_IN", "TRANSFER_OUT",
  "CONVERSION_IN", "CONVERSION_OUT",
  "PRODUCTION_IN", "PRODUCTION_OUT",
];

const money = { type: Number, required: true, min: 0 };

const stockLedgerSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  locationId: { type: Schema.Types.ObjectId, ref: "WarehouseLocationV2", default: null },
  txnType: { type: String, enum: TXN_TYPES, required: true },
  direction: { type: String, enum: ["IN", "OUT"], required: true },
  referenceType: { type: String, default: "" },
  referenceId: { type: String, default: "" },
  qtyIn: { type: Number, default: 0, min: 0 },
  qtyOut: { type: Number, default: 0, min: 0 },
  unit: { type: String, required: true },
  unitCost: money,
  totalValue: money,
  // Item-level state AFTER this entry
  runningQty: { type: Number, required: true },
  runningValue: { type: Number, required: true },
  avgCost: { type: Number, required: true, min: 0 },
  reelId: { type: Schema.Types.ObjectId, ref: "Reel", default: null },
  remarks: { type: String, default: "" },
  idempotencyKey: { type: String, default: undefined },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: true });

stockLedgerSchema.index({ companyId: 1, itemId: 1, createdAt: 1 });
stockLedgerSchema.index({ companyId: 1, createdAt: -1 });
stockLedgerSchema.index({ companyId: 1, txnType: 1 });
stockLedgerSchema.index({ companyId: 1, referenceType: 1, referenceId: 1 });
stockLedgerSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

// Append-only: nothing may edit or delete a posted movement. Corrections are new, opposite entries.
const IMMUTABLE_OPS = ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"];
stockLedgerSchema.pre(IMMUTABLE_OPS, function () {
  throw new Error("The stock ledger is append-only: post a correcting entry instead");
});
stockLedgerSchema.pre("save", function () {
  if (!this.isNew) throw new Error("The stock ledger is append-only: post a correcting entry instead");
});

const itemCostSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  qty: { type: Number, default: 0 },
  value: { type: Number, default: 0 },
  avgCost: { type: Number, default: 0, min: 0 },
  allowNegative: { type: Boolean, default: false },
}, { timestamps: true, strict: true });
itemCostSchema.index({ companyId: 1, itemId: 1 }, { unique: true });

const stockBalanceSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  locationId: { type: Schema.Types.ObjectId, ref: "WarehouseLocationV2", default: null },
  qty: { type: Number, default: 0 },
}, { timestamps: true, strict: true });
stockBalanceSchema.index({ companyId: 1, itemId: 1, locationId: 1 }, { unique: true });

const reelSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  reelNumber: { type: String, required: true, trim: true },
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  gsm: { type: Number, min: 1 },
  widthCm: { type: Number, min: 0 },
  initialWeightKg: { type: Number, required: true, min: 0.001 },
  remainingWeightKg: { type: Number, required: true, min: 0 },
  supplierId: { type: Schema.Types.ObjectId, ref: "Party", default: null },
  purchaseRef: { type: String, default: "" },
  locationId: { type: Schema.Types.ObjectId, ref: "WarehouseLocationV2", default: null },
  unitCostPerKg: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["Available", "Consumed"], default: "Available" },
  receiptLedgerId: { type: Schema.Types.ObjectId, ref: "StockLedger" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, strict: true });
reelSchema.index({ companyId: 1, reelNumber: 1 }, { unique: true });
reelSchema.index({ companyId: 1, itemId: 1, status: 1 });

const StockLedger = mongoose.models.StockLedger || mongoose.model("StockLedger", stockLedgerSchema);
const ItemCost = mongoose.models.ItemCost || mongoose.model("ItemCost", itemCostSchema);
const StockBalance = mongoose.models.StockBalance || mongoose.model("StockBalance", stockBalanceSchema);
const Reel = mongoose.models.Reel || mongoose.model("Reel", reelSchema);

module.exports = { StockLedger, ItemCost, StockBalance, Reel, TXN_TYPES };
