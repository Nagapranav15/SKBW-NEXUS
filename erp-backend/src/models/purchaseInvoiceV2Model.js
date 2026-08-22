const mongoose = require("mongoose");

const purchaseInvoiceItemSchema = new mongoose.Schema({
  skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuV2', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  purchasePrice: { type: Number, required: true }, 
  totalPrice: { type: Number, required: true },    
  lotNumber: { type: String, required: true },     
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true },
  reamWeight: { type: Number },
  ratePerKg: { type: Number },
  splits: [{
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true },
    quantity: { type: Number, required: true }
  }],
  reels: [{
    reelNumber: { type: String, required: true },
    gsm: { type: Number, required: true },
    width: { type: Number, required: true },
    weight: { type: Number, required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2' }
  }]
});

const purchaseInvoiceV2Schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true }, 
  items: [purchaseInvoiceItemSchema],
  subTotal: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  freight: { type: Number, default: 0 },
  craneCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  paymentStatus: { type: String, enum: ["Unpaid", "Partially Paid", "Paid"], default: "Unpaid" },
  paidAmount: { type: Number, default: 0 },
  dueDate: { type: Date },
  remarks: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  status: { type: String, enum: ["Draft", "Posted", "Cancelled"], default: "Posted" }
}, { timestamps: true });

module.exports = mongoose.model("PurchaseInvoiceV2", purchaseInvoiceV2Schema);
