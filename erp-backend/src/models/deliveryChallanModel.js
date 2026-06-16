const mongoose = require("mongoose");

const dcItemSchema = new mongoose.Schema({
  itemId: String,
  itemName: String,
  orderedQty: Number,
  deliveredQty: Number,
  price: Number,
  total: Number
}, { _id: true });

const deliveryChallanSchema = new mongoose.Schema({
  dcNumber: {
    type: String,
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SalesOrder"
  },
  orderNumber: {
    type: String,
    default: ""
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
  transporterName: {
    type: String,
    default: ""
  },
  vehicleNumber: {
    type: String,
    default: ""
  },
  items: [dcItemSchema],
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
    enum: ["draft", "ready", "dispatched", "delivered"],
    default: "draft"
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

module.exports = mongoose.model("DeliveryChallan", deliveryChallanSchema);
