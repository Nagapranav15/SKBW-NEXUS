const mongoose = require("mongoose");

const openingStockEntrySchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    required: true
  },
  sectionId: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    default: () => new Date()
  },
  notes: {
    type: String,
    default: ""
  },
  movement_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockMovement",
    default: null
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

openingStockEntrySchema.index({ company: 1, item: 1 });
openingStockEntrySchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model("OpeningStockEntry", openingStockEntrySchema);
