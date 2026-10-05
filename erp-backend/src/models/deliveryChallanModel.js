const mongoose = require("mongoose");

const dcItemSchema = new mongoose.Schema({
  itemId: String,
  skuId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  skuCode: {
    type: String,
    default: ""
  },
  itemName: String,
  orderedQty: Number,
  deliveredQty: Number,
  deliveredPcs: Number,
  uom: String,
  price: Number,
  total: Number
}, { _id: true, strict: false });

const deliveryChallanSchema = new mongoose.Schema({
  dcNumber: {
    type: String,
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.Mixed,
    ref: "SalesOrder"
  },
  orderNumber: {
    type: String,
    default: ""
  },
  customerId: {
    type: mongoose.Schema.Types.Mixed,
    ref: "Party"
  },
  customerName: {
    type: String,
    required: true
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split("T")[0]
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
