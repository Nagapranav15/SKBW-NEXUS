const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ["credit", "debit", "income", "expense", "transfer"],
    required: true
  },
  category: {
    type: String,
    default: ""
  },
  subcategory: {
    type: String,
    default: ""
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "upi", "card", "bank_transfer", "cheque", "custom"],
    default: "cash"
  },
  customPaymentMethod: {
    type: String,
    default: ""
  },
  referenceId: {
    type: String,
    default: ""
  },
  ledgerAccount: {
    type: String,
    default: ""
  },
  description: {
    type: String,
    default: ""
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Party",
    default: null
  },
  partyName: {
    type: String,
    default: ""
  },
  // Source tracking for auto-created transactions
  source_type: {
    type: String,
    enum: ["MANUAL", "SALE", "PURCHASE", "EXPENSE", "IMPORT", "SYSTEM"],
    default: "MANUAL"
  },
  source_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  payment_status: {
    type: String,
    enum: ["paid", "pending", "partial"],
    default: "paid"
  },
  dataYear: {
    type: Number,
    default: () => new Date().getFullYear()
  },
  source: {
    type: String,
    enum: ["manual", "import", "system"],
    default: "manual"
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

transactionSchema.index({ company: 1, date: -1 });
transactionSchema.index({ company: 1, dataYear: 1 });
transactionSchema.index({ transactionId: 1, company: 1 }, { unique: true });
transactionSchema.index({ source_type: 1, source_id: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
