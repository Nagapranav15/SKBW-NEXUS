const mongoose = require("mongoose");

const skuV2Schema = new mongoose.Schema({
  skuCode: { type: String, required: true, index: true },
  name: { type: String, required: true, index: true },
  category: { 
    type: String, 
    required: true, 
    index: true
  },
  paperType: {
    type: String,
    enum: ["Reels", "Sheets", "None"],
    default: "None"
  },
  unit: { type: String, required: true },
  altUnit: { type: String, required: false },
  altUnitConversion: { type: Number, required: false },
  altUnitDirection: { type: String, enum: ['PRIMARY_TO_ALT', 'ALT_TO_PRIMARY'], required: false },
  gsm: { type: Number, required: false },
  width: { type: Number, required: false },
  length: { type: Number, required: false },
  brand: { type: String, default: "" },
  title: { type: String, default: "" },
  group: { type: String, default: "" },
  ruleType: { 
    type: String, 
    required: false
  },
  pages: { type: Number, required: false },
  reamWeight: { type: Number, required: false },
  booksGbl: { type: Number, required: false },
  openingStock: { type: Number, default: 0 },
  minStockLevel: { type: Number, required: false },
  reorderLevel: { type: Number, required: false },
  initialLocationId: { type: String, required: false },
  initialLocation: { type: mongoose.Schema.Types.Mixed, required: false },
  defaultLocation: { type: String, required: false },
  status: { type: String, required: true, enum: ["Active", "Inactive"], default: "Active" },
  bomItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recipeYieldQty: { type: Number, default: 1 },
  recipeYieldUnit: { type: String, default: "" },
  batchYieldQty: { type: Number, default: 1 },
  batchYieldUnit: { type: String, default: "" },
  processSteps: { type: [mongoose.Schema.Types.Mixed], default: [] },
  preferredVendor: { type: String, default: "" },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: false },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, strict: false });

skuV2Schema.index({ skuCode: 1, company: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
skuV2Schema.index({ company: 1, category: 1 });
skuV2Schema.index({ company: 1, status: 1 });

module.exports = mongoose.model("SkuV2", skuV2Schema);
