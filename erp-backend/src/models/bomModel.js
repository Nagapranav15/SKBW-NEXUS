const mongoose = require("mongoose");

const bomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  output_sku: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true },
  output_quantity: { type: Number, required: true, default: 1 },
  components: [{
    sku: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, enum: ["kg", "pcs", "gbl"], required: true }
  }],
  notes: { type: String, default: "" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true }
}, { timestamps: true });

bomSchema.index({ company: 1, output_sku: 1 });

module.exports = mongoose.model("Bom", bomSchema);
