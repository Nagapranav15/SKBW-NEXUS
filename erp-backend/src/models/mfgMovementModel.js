const mongoose = require("mongoose");

const mfgMovementSchema = new mongoose.Schema({
  type: { type: String, enum: ["IN", "OUT", "TRANSFER"], required: true },
  from_zone: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", default: null },
  to_zone: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", default: null },
  sku: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  gsm_used: { type: Number, default: null },
  books_per_gbl: { type: Number, default: null },
  cost_per_unit: { type: Number, default: 0 },
  remarks: { type: String, default: "" },
  source: { type: String, enum: ["production", "purchase", "dispatch", "usage", "transfer", "adjustment"], default: "production" },
  location_name: { type: String, default: "" },
  from_location_name: { type: String, default: "" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

mfgMovementSchema.index({ company: 1, createdAt: -1 });
mfgMovementSchema.index({ sku: 1, company: 1 });
mfgMovementSchema.index({ from_zone: 1 });
mfgMovementSchema.index({ to_zone: 1 });
mfgMovementSchema.index({ type: 1, company: 1 });

module.exports = mongoose.model("MfgMovement", mfgMovementSchema);
