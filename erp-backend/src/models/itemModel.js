const mongoose = require("mongoose");

const bomItemSchema = new mongoose.Schema({
  materialId: String,
  materialName: String,
  quantity: Number,
  unit: String,
  cost: Number,
  total: Number
}, { _id: true });

const itemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ["finished", "semi", "raw"],
    required: true
  },
  description: {
    type: String,
    default: ""
  },
  primaryUnit: {
    type: String,
    required: true
  },
  altUnit: {
    type: String,
    default: ""
  },
  conversionFactor: {
    type: Number,
    default: 1
  },
  price: {
    type: Number,
    default: 0
  },
  cost: {
    type: Number,
    default: 0
  },
  stock: {
    type: Number,
    default: 0
  },
  minStock: {
    type: Number,
    default: 0
  },
  bomItems: [bomItemSchema],
  bomTotalCost: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Item", itemSchema);
