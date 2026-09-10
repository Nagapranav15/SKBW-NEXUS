const mongoose = require("mongoose");

const salesOrderItemV2Schema = new mongoose.Schema({
  skuId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SkuV2"
  },
  skuCode: {
    type: String,
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: "Finished Goods"
  },
  uom: {
    type: String,
    default: "Pcs"
  },
  altUnit: {
    type: String,
    default: ""
  },
  altUnitConversion: {
    type: Number,
    default: 1
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.001
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0
  },
  taxableAmount: {
    type: Number,
    required: true,
    default: 0
  },
  hsnCode: {
    type: String,
    default: ""
  },
  gstRate: {
    type: Number,
    default: 18
  },
  cgstAmount: {
    type: Number,
    default: 0
  },
  sgstAmount: {
    type: Number,
    default: 0
  },
  igstAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  dispatchedQty: {
    type: Number,
    default: 0
  }
}, { _id: true });

const salesOrderV2Schema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Party"
  },
  customerId: {
    type: String,
    default: ""
  },
  customerName: {
    type: String,
    required: true
  },
  orderDate: {
    type: String,
    required: true
  },
  promisedDate: {
    type: String,
    default: ""
  },
  customerPoNumber: {
    type: String,
    default: ""
  },
  customerPoDate: {
    type: String,
    default: ""
  },
  facility: {
    type: String,
    default: "Main Factory"
  },
  internalNotes: {
    type: String,
    default: ""
  },
  billingAddress: {
    type: Object,
    default: {}
  },
  shippingAddress: {
    type: Object,
    default: {}
  },
  isInterstate: {
    type: Boolean,
    default: false
  },
  items: [salesOrderItemV2Schema],
  subtotal: {
    type: Number,
    default: 0
  },
  totalCgst: {
    type: Number,
    default: 0
  },
  totalSgst: {
    type: Number,
    default: 0
  },
  totalIgst: {
    type: Number,
    default: 0
  },
  freightCharges: {
    type: Number,
    default: 0
  },
  roundOff: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    default: 0
  },
  materialsStatus: {
    type: String,
    enum: ["Ready", "Shortfall", "Done"],
    default: "Ready"
  },
  fulfillmentStatus: {
    type: String,
    enum: ["Not Started", "Partial", "Fulfilled"],
    default: "Not Started"
  },
  status: {
    type: String,
    enum: ["Draft", "Confirmed", "In Production", "Partially Delivered", "Delivered", "Invoiced", "Cancelled"],
    default: "Confirmed",
    index: true
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, { timestamps: true });

salesOrderV2Schema.index({ company: 1, createdAt: -1 });
salesOrderV2Schema.index({ company: 1, status: 1 });
salesOrderV2Schema.index({ orderNumber: 1, company: 1 }, { unique: true });

module.exports = mongoose.model("SalesOrderV2", salesOrderV2Schema);
