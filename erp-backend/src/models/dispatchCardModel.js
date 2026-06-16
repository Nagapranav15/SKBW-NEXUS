const mongoose = require("mongoose");

const dispatchItemSchema = new mongoose.Schema({
  itemId: String,
  itemName: String,
  quantity: Number,
  scannedQty: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "scanning", "completed"],
    default: "pending"
  }
}, { _id: true });

const dispatchCardSchema = new mongoose.Schema({
  dcId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DeliveryChallan"
  },
  dcNumber: {
    type: String,
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Party"
  },
  customerName: {
    type: String,
    default: ""
  },
  transporterName: {
    type: String,
    default: ""
  },
  vehicleNumber: {
    type: String,
    default: ""
  },
  items: [dispatchItemSchema],
  status: {
    type: String,
    enum: ["ready", "in_progress", "completed"],
    default: "ready"
  },
  assignedTo: {
    type: String,
    default: ""
  },
  notes: {
    type: String,
    default: ""
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("DispatchCard", dispatchCardSchema);
