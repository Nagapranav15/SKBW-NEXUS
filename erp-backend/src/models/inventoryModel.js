const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
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
    default: 0,
    min: 0
  },
  reserved_quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  last_movement_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockMovement",
    default: null
  },
  last_updated: {
    type: Date,
    default: () => new Date()
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual: available stock = quantity - reserved
inventorySchema.virtual("available_quantity").get(function () {
  return (this.quantity || 0) - (this.reserved_quantity || 0);
});

inventorySchema.index(
  { item: 1, warehouse: 1, sectionId: 1, company: 1 },
  { unique: true }
);

// Additional indexes for fast lookups
inventorySchema.index({ company: 1, item: 1 });
inventorySchema.index({ company: 1, warehouse: 1 });
inventorySchema.index({ company: 1, quantity: 1 });

module.exports = mongoose.model("Inventory", inventorySchema);
