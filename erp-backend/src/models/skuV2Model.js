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
  status: { type: String, required: true, enum: ["Active", "Inactive"], default: "Active" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true });

skuV2Schema.index({ skuCode: 1, company: 1 }, { unique: true });
skuV2Schema.index({ company: 1, category: 1 });
skuV2Schema.index({ company: 1, status: 1 });

module.exports = mongoose.model("SkuV2", skuV2Schema);
