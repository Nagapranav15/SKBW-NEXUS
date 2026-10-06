const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema({
  itemId: String,
  skuId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  skuCode: {
    type: String,
    default: ""
  },
  itemName: {
    type: String,
    required: true
  },
  uom: {
    type: String,
    default: "GBL"
  },
  pcsPerGbl: {
    type: Number,
    default: 246
  },
  dispatchedGbl: {
    type: Number,
    default: 0
  },
  dispatchedPcs: {
    type: Number,
    default: 0
  },
  invoiceQtyGbl: {
    type: Number,
    default: 0
  },
  invoiceQtyPcs: {
    type: Number,
    default: 0
  },
  locationId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  locationName: {
    type: String,
    default: ""
  },
  locationPath: {
    type: String,
    default: ""
  },
  rate: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    default: 0
  }
}, { _id: true, strict: false });

const additionalChargeSchema = new mongoose.Schema({
  description: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    enum: ["Fixed", "Percentage"],
    default: "Fixed"
  },
  amount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const salesInvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true
  },
  invoiceDate: {
    type: String,
    default: () => new Date().toISOString().split("T")[0]
  },
  dispatchId: {
    type: mongoose.Schema.Types.Mixed,
    ref: "DeliveryChallan",
    default: null
  },
  dispatchNumber: {
    type: String,
    default: ""
  },
  dispatchDate: {
    type: String,
    default: ""
  },
  orderId: {
    type: mongoose.Schema.Types.Mixed,
    ref: "SalesOrderV2",
    default: null
  },
  orderNumber: {
    type: String,
    default: ""
  },
  customerId: {
    type: mongoose.Schema.Types.Mixed,
    ref: "Party",
    default: null
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    default: ""
  },
  region: {
    type: String,
    default: ""
  },
  city: {
    type: String,
    default: ""
  },
  transporterName: {
    type: String,
    default: ""
  },
  lrNumber: {
    type: String,
    default: ""
  },
  lrDate: {
    type: String,
    default: ""
  },
  vehicleNumber: {
    type: String,
    default: ""
  },
  numberOfPackages: {
    type: Number,
    default: 0
  },
  paymentTerms: {
    type: String,
    default: "30 Days"
  },
  dueDate: {
    type: String,
    default: ""
  },
  billTo: {
    name: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    phone: { type: String, default: "" },
    gstin: { type: String, default: "" }
  },
  shipTo: {
    name: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    phone: { type: String, default: "" },
    gstin: { type: String, default: "" }
  },
  sameAsBillTo: {
    type: Boolean,
    default: true
  },
  items: [invoiceItemSchema],
  additionalCharges: [additionalChargeSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  totalAdditionalCharges: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    default: 0
  },
  totalQtyGbl: {
    type: Number,
    default: 0
  },
  totalQtyPcs: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ["draft", "created", "paid", "cancelled"],
    default: "created"
  },
  printOptions: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      companyHeader: true,
      itemWiseDetails: true,
      locationDetails: true,
      transporterDetails: true,
      pageNumbers: true,
      termsConditions: true
    })
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  createdBy: {
    type: String,
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model("SalesInvoice", salesInvoiceSchema);
