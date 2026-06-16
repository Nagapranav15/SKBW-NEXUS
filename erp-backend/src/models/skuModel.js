const mongoose = require("mongoose");

const skuSchema = new mongoose.Schema({
  sku_code: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, enum: ["Raw", "Semi", "Finished"], required: true },
  brand: { type: String, default: "" },
  pages: { type: Number, default: null },
  default_books_per_gbl: { type: Number, default: null },
  unit_type: { type: String, enum: ["kg", "pcs", "gbl"], required: true },
  cost_per_unit: { type: Number, default: 0 },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true }
}, { timestamps: true });

skuSchema.index({ sku_code: 1, company: 1 }, { unique: true });
skuSchema.index({ company: 1, category: 1 });
skuSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model("Sku", skuSchema);
