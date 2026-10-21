/** A Conversion turns inputs into outputs (sheeting, slitting, ruling, printing, binding) and records everything. */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const CONVERSION_TYPES = ["SHEETING", "SLITTING", "RULING", "INDEX_PRINTING", "COVER_PRINTING", "BINDING"];

const inputSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  locationId: { type: Schema.Types.ObjectId, default: null },
  qty: { type: Number, required: true, min: 0.001 },
  unit: { type: String, required: true },
  unitCost: { type: Number, required: true, min: 0 },
  value: { type: Number, required: true, min: 0 },
  reels: [{ reelId: { type: Schema.Types.ObjectId, ref: "Reel" }, reelNumber: String, weightKg: Number, _id: false }],
  ledgerId: { type: Schema.Types.ObjectId, ref: "StockLedger" },
}, { _id: false });

const outputSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  locationId: { type: Schema.Types.ObjectId, default: null },
  qty: { type: Number, required: true, min: 0.001 },
  unit: { type: String, required: true },
  unitCost: { type: Number, required: true, min: 0 },
  value: { type: Number, required: true, min: 0 },
  ledgerId: { type: Schema.Types.ObjectId, ref: "StockLedger" },
  reelIds: [{ type: Schema.Types.ObjectId, ref: "Reel" }],
}, { _id: false });

const chargeSchema = new Schema({
  kind: { type: String, enum: ["PROCESSING", "JOB_WORK", "OTHER"], required: true },
  description: { type: String, default: "" },
  vendorId: { type: Schema.Types.ObjectId, ref: "Party", default: null },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const sheetingSchema = new Schema({
  widthCm: Number, lengthCm: Number, gsm: Number, sheetsPerReam: Number,
  reelsOnStand: Number, slitsCount: Number, cuts: Number,
  startMeter: Number, endMeter: Number,
  theoreticalSheets: Number, theoreticalReams: Number, actualSheets: Number, actualReams: Number,
  varianceSheets: Number, wastePercentage: Number,
  scrapWeightKg: Number, scrapRatePerKg: Number, coreCount: Number, coreRatePerPc: Number,
  costPerSheet: Number, costPerReam: Number, costPer4Up: Number,
  machineName: String,
}, { _id: false });

const conversionSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  number: { type: String, required: true },
  type: { type: String, enum: CONVERSION_TYPES, required: true },
  date: { type: Date, default: Date.now },
  inputs: { type: [inputSchema], validate: (v) => v.length > 0 },
  outputs: { type: [outputSchema], validate: (v) => v.length > 0 },
  charges: [chargeSchema],
  wastageQty: { type: Number, default: 0, min: 0 },
  wastageNote: { type: String, default: "" },
  scrapCredit: { type: Number, default: 0, min: 0 },
  totalInputValue: { type: Number, required: true, min: 0 },
  totalChargeValue: { type: Number, default: 0, min: 0 },
  netCost: { type: Number, required: true, min: 0 },
  sheeting: { type: sheetingSchema, default: undefined },
  reference: { type: String, default: "" },
  operatorName: { type: String, default: "" },
  notes: { type: String, default: "" },
  status: { type: String, enum: ["Posted"], default: "Posted" },
  idempotencyKey: { type: String, default: undefined },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, strict: true });

conversionSchema.index({ companyId: 1, number: 1 }, { unique: true });
conversionSchema.index({ companyId: 1, date: -1 });
conversionSchema.index({ companyId: 1, type: 1, date: -1 });
conversionSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

// Posted conversions are history: corrections are new conversions, never edits
conversionSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("Posted conversions cannot be edited or deleted");
});
conversionSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Posted conversions cannot be edited or deleted");
});

const counterSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { strict: true });
counterSchema.index({ companyId: 1, key: 1 }, { unique: true });

const Conversion = mongoose.models.Conversion || mongoose.model("Conversion", conversionSchema);
const CoreCounter = mongoose.models.CoreCounter || mongoose.model("CoreCounter", counterSchema);

module.exports = { Conversion, CoreCounter, CONVERSION_TYPES };
