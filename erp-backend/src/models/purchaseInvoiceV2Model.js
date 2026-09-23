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
    reelNumber: { type: String },
    gsm: { type: Number },
    width: { type: Number },
    weight: { type: Number },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2' }
  }]
});

const purchaseInvoiceV2Schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, index: true },
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

purchaseInvoiceV2Schema.index({ company: 1, invoiceNumber: 1 }, { unique: true });

const PurchaseInvoiceV2 = mongoose.model("PurchaseInvoiceV2", purchaseInvoiceV2Schema);

// Self-healing index migration: drop legacy global unique invoiceNumber_1 index so invoices are unique per company
const dropLegacyIndex = async () => {
  try {
    const col = PurchaseInvoiceV2.collection;
    if (col) {
      const indexes = await col.indexes();
      const hasOldGlobalIndex = indexes.some(idx => idx.name === "invoiceNumber_1" && idx.unique && (!idx.key || !idx.key.company));
      if (hasOldGlobalIndex) {
        await col.dropIndex("invoiceNumber_1");
        console.log("Successfully dropped legacy global unique index invoiceNumber_1 on PurchaseInvoiceV2");
      }
    }
  } catch (e) {
    // Ignore if index does not exist or collection is not yet ready
  }
};

if (mongoose.connection.readyState === 1) {
  dropLegacyIndex();
} else {
  mongoose.connection.once("open", dropLegacyIndex);
}

module.exports = PurchaseInvoiceV2;

