const mongoose = require("mongoose");

const minimumStockLevelSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  minimum_quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  reorder_quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

minimumStockLevelSchema.index({ item: 1, company: 1 }, { unique: true });
minimumStockLevelSchema.index({ company: 1, is_active: 1 });

module.exports = mongoose.model("MinimumStockLevel", minimumStockLevelSchema);
