const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema({
  sectionId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  },
  width: {
    type: Number,
    default: 20
  },
  height: {
    type: Number,
    default: 20
  },
  color: {
    type: String,
    default: "#e2e8f0"
  }
}, { _id: true });

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ""
  },
  sections: [sectionSchema],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Warehouse", warehouseSchema);
