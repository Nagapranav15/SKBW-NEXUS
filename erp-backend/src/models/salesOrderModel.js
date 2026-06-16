const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  itemId: String,
  itemName: String,
  quantity: Number,
  price: Number,
  total: Number
}, { _id: true });

const salesOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Party"
  },
  customerName: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  deliveryDate: {
    type: String,
    default: ""
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "in_production", "ready", "dispatched", "delivered", "cancelled"],
    default: "pending"
  },
  notes: {
    type: String,
    default: ""
  },
  // Payment Details
  payment_mode: {
    type: String,
    enum: ["upi", "cash", "bank_transfer", "cheque"],
    default: "cash"
  },
  payment_reference_id: {
    type: String,
    default: ""
  },
  payment_status: {
    type: String,
    enum: ["paid", "pending", "partial"],
    default: "pending"
  },
  payment_notes: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("SalesOrder", salesOrderSchema);
